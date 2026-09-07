import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

export type EventResult = { title: string; url: string; date?: string; venue?: string; content: string; imageUrl?: string };

export type TicketmasterEventDetail = {
  title: string;
  url?: string;
  imageUrl?: string;
  date?: string;
  doorsTime?: string;
  ageInfo?: string;
  status?: string;
  venue?: { name?: string; address?: string; city?: string; latitude?: number; longitude?: number };
  performers: string[];
  genre?: string;
  priceRange?: string;
  onSale?: string;
  info?: string;
  pleaseNote?: string;
  promoter?: string;
  seatmapUrl?: string;
};

const TM_HOST = "https://app.ticketmaster.com/discovery/v2";
const tmKey = () => {
  const key = process.env.TICKETMASTER_CONSUMER_KEY ?? process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error("TICKETMASTER_API_KEY is not configured");
  return key;
};

/** The 16–20-char Discovery id, if the Ticketmaster URL carries one. */
export function ticketmasterIdFromUrl(url: string): string | null {
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const afterEvent = segs[segs.indexOf("event") + 1];
    const candidate = afterEvent && /^[0-9A-Za-z]{10,}$/.test(afterEvent) ? afterEvent : segs.reverse().find((s) => /^[0-9A-Za-z]{12,}$/.test(s));
    return candidate ?? null;
  } catch {
    return null;
  }
}

/** One raw Ticketmaster event object — shape shared by `events/{id}` and the search results. */
type RawTmEvent = {
  name?: string; url?: string; info?: string; pleaseNote?: string; promoter?: { name?: string };
  images?: Array<{ url?: string; width?: number }>;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  sales?: { public?: { startDateTime?: string; endDateTime?: string } };
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }>;
  seatmap?: { staticUrl?: string };
  ageRestrictions?: { legalAgeEnforced?: boolean };
  _embedded?: {
    venues?: Array<{
      name?: string; address?: { line1?: string }; city?: { name?: string }; state?: { stateCode?: string };
      postalCode?: string; location?: { latitude?: string; longitude?: string };
      generalInfo?: { generalRule?: string; childRule?: string };
    }>;
    attractions?: Array<{ name?: string }>;
  };
};

/** Normalise one raw Ticketmaster event into the detail shape the app renders. */
function mapTmEvent(e: RawTmEvent): TicketmasterEventDetail | null {
  if (!e.name) return null;
  const start = e.dates?.start;
  const v = e._embedded?.venues?.[0];
  const cls = e.classifications?.find((c) => c.segment?.name) ?? e.classifications?.[0];
  const price = (e.priceRanges ?? []).find((p) => p.min || p.max);
  const sale = e.sales?.public;

  const noteBlob = [e.info, e.pleaseNote, v?.generalInfo?.generalRule].filter(Boolean).join(" ");
  const doorsMatch = noteBlob.match(/doors?\s*(?:open(?:\s*at)?|:)?\s*((?:1[0-2]|0?[1-9])(?::[0-5][0-9])?\s*(?:[ap]\.?m\.?)?)/i);
  const ageMatch = noteBlob.match(/\b(1[0-9]|2[0-9])\s*\+|\ball ages\b|\bno minors\b|\bunder\s*1[0-9]s?[^.]*adult/i);

  return {
    title: e.name,
    url: e.url,
    imageUrl: [...(e.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url,
    date: [start?.localDate, start?.localTime?.slice(0, 5)].filter(Boolean).join(" ") || undefined,
    doorsTime: doorsMatch ? doorsMatch[1].trim() : undefined,
    ageInfo: ageMatch ? ageMatch[0].trim() : e.ageRestrictions?.legalAgeEnforced ? "18+ (ID required)" : undefined,
    status: e.dates?.status?.code && e.dates.status.code !== "onsale" ? e.dates.status.code.replace(/([a-z])([A-Z])/g, "$1 $2") : undefined,
    venue: v
      ? {
          name: v.name,
          address: [v.address?.line1, v.city?.name, v.state?.stateCode, v.postalCode].filter(Boolean).join(", ") || undefined,
          city: v.city?.name,
          latitude: v.location?.latitude ? Number(v.location.latitude) : undefined,
          longitude: v.location?.longitude ? Number(v.location.longitude) : undefined,
        }
      : undefined,
    performers: (e._embedded?.attractions ?? []).map((a) => a.name).filter((n): n is string => Boolean(n)),
    genre: [cls?.segment?.name, cls?.genre?.name, cls?.subGenre?.name].filter((g) => g && g !== "Undefined").join(" · ") || undefined,
    priceRange:
      price && (price.min || price.max)
        ? price.min && price.max && price.min !== price.max
          ? `${price.min}–${price.max} ${price.currency ?? ""}`.trim()
          : `${price.min ?? price.max} ${price.currency ?? ""}`.trim()
        : undefined,
    onSale: sale?.startDateTime ? `On sale ${sale.startDateTime.slice(0, 10)}${sale.endDateTime ? ` – ${sale.endDateTime.slice(0, 10)}` : ""}` : undefined,
    info: e.info?.trim() || undefined,
    pleaseNote: e.pleaseNote?.trim() || undefined,
    promoter: e.promoter?.name,
    seatmapUrl: e.seatmap?.staticUrl,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Full detail for one Ticketmaster event, by Discovery id or URL. */
export async function eventDetail(idOrUrl: string, signal?: AbortSignal): Promise<TicketmasterEventDetail | null> {
  const key = tmKey();
  const id = /^https?:/i.test(idOrUrl) ? ticketmasterIdFromUrl(idOrUrl) : idOrUrl;
  if (!id) return null;
  const url = new URL(`${TM_HOST}/events/${encodeURIComponent(id)}.json`);
  url.searchParams.set("apikey", key);
  const response = await guardedFetch("ticketmaster", url, { signal: withProviderTimeout(signal) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Ticketmaster event detail failed: ${response.status}`);
  return mapTmEvent((await response.json()) as RawTmEvent);
}

/**
 * The by-id endpoint 404s for a lot of the app's own event cards (Canadian display ids,
 * Universe slugs). The SEARCH endpoint returns the same rich per-event payload, so match
 * on the name there instead — this is where price / line-up / seat map actually come from.
 */
export async function eventDetailBySearch(
  name: string,
  city: string | undefined,
  dateHint?: string,
  signal?: AbortSignal,
): Promise<TicketmasterEventDetail | null> {
  const key = tmKey();
  const url = new URL(`${TM_HOST}/events.json`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("keyword", name.slice(0, 90));
  if (city) url.searchParams.set("city", city);
  url.searchParams.set("size", "20");
  url.searchParams.set("sort", "relevance,desc");
  const response = await guardedFetch("ticketmaster", url, { signal: withProviderTimeout(signal) });
  if (!response.ok) return null;
  const body = (await response.json()) as { _embedded?: { events?: RawTmEvent[] } };
  const events = body._embedded?.events ?? [];
  if (events.length === 0) return null;

  const want = norm(name);
  const day = /^\d{4}-\d{2}-\d{2}/.test(dateHint ?? "") ? dateHint!.slice(0, 10) : null;
  const scored = events
    .map((e) => {
      const got = norm(e.name ?? "");
      let score = got === want ? 3 : got.includes(want) || want.includes(got) ? 2 : 0;
      if (score > 0 && day && e.dates?.start?.localDate === day) score += 1;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? mapTmEvent(scored[0].e) : null;
}

export async function events(
  query: string,
  destination: string,
  window?: { start?: string; end?: string },
  signal?: AbortSignal,
  /** "relevance" surfaces bigger acts for a broad "what's on" query; "date" (default) for a specific one. */
  sort: "date" | "relevance" = "date",
  page = 0,
): Promise<EventResult[]> {
  const url = new URL(`${TM_HOST}/events.json`);
  url.searchParams.set("apikey", tmKey());
  url.searchParams.set("city", destination);
  if (query) url.searchParams.set("keyword", query);
  // Constrain to the trip window when we have it, so cards aren't months out.
  if (/^\d{4}-\d{2}-\d{2}$/.test(window?.start ?? "")) url.searchParams.set("startDateTime", `${window!.start}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(window?.end ?? "")) url.searchParams.set("endDateTime", `${window!.end}T23:59:59Z`);
  url.searchParams.set("size", "30");
  url.searchParams.set("sort", sort === "relevance" ? "relevance,desc" : "date,asc");
  if (page > 0) url.searchParams.set("page", String(page));
  const response = await guardedFetch("ticketmaster", url, { signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Ticketmaster search failed: ${response.status}`);
  const body = (await response.json()) as { _embedded?: { events?: RawTmEvent[] } };
  return (body._embedded?.events ?? []).flatMap((event) => {
    if (!event.name || !event.url) return [];
    const start = event.dates?.start;
    const date = [start?.localDate, start?.localTime?.slice(0, 5)].filter(Boolean).join(" ");
    const venueName = event._embedded?.venues?.[0]?.name;
    const city = event._embedded?.venues?.[0]?.city?.name;
    const venue = [venueName, city].filter(Boolean).join(", ");
    return [{
      title: event.name,
      url: event.url,
      date: date || undefined,
      venue: venue || undefined,
      content: [date, venue].filter(Boolean).join(" · "),
      imageUrl: event.images?.find((image) => image.url)?.url,
    }];
  });
}
