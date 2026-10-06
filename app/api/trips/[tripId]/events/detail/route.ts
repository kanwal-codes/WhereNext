import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eventDetailSchema, type EventDetail } from "@/packages/contracts/event";
import { eventDetail as ticketmasterDetail, eventDetailBySearch, ticketmasterIdFromUrl, type TicketmasterEventDetail } from "@/packages/providers/ticketmaster/client";
import { research } from "@/packages/providers/tavily/client";
import { generateStructured } from "@/packages/ai/model-policy";
import { requireTripMember, tripAuthResponse } from "@/lib/server/trip-auth";
import { LIMITS } from "@/lib/server/limits";
import { fail } from "@/lib/server/with-route";
import { cached } from "@/lib/server/ttl-cache";
import { ticketSellerLabel } from "@/lib/ticket-provider";

const tmConfigured = () => Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
const webConfigured = () => Boolean(process.env.TAVILY_API_KEY);
const aiConfigured = () => Boolean(process.env.AI_GATEWAY_API_KEY);

/** Ticketmaster's `pleaseNote` is often just bilingual terms-and-conditions boilerplate — drop that. */
function usefulNote(note: string | null | undefined): string | null {
  const t = (note ?? "").trim();
  if (!t) return null;
  if (t.length > 180 && /(terms and conditions|code of conduct|privacy policy|politique de confidentialit)/i.test(t)) return null;
  return t;
}

/** "City, Country" from a formatted address. */
function cityFrom(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || null;
}

/**
 * Find the Ticketmaster event behind this card. A TM url gives it directly; otherwise
 * (Eventbrite / a web hit) search TM by name + city and match on the title.
 */
async function resolveTicketmaster(
  name: string,
  url: string,
  venueHint: string,
  dateHint: string,
  signal?: AbortSignal,
): Promise<TicketmasterEventDetail | null> {
  if (!tmConfigured()) return null;
  // Try the direct id first; the by-id endpoint 404s for a lot of the app's own cards, so
  // fall back to matching the event in a keyword search (same rich payload, resolvable id).
  const byId = /^https?:/i.test(url) && ticketmasterIdFromUrl(url) ? await ticketmasterDetail(url, signal).catch(() => null) : null;
  if (byId) return byId;
  const lastPart = venueHint.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return eventDetailBySearch(name, lastPart, dateHint, signal).catch(() => null);
}

const enrichmentSchema = z.object({
  about: z.string().max(700).nullable(),
  whatToExpect: z.string().max(700).nullable(),
  lineupNote: z.string().max(300).nullable(),
  ageInfo: z.string().max(120).nullable(),
  doorsTime: z.string().max(40).nullable(),
  showTime: z.string().max(40).nullable().optional(),
  admission: z.string().max(120).nullable().optional(),
});

/**
 * Clean one-line "about" from what we already know for certain — used when the AI pass
 * can't produce a summary. Never wrong, never messy: no raw ticketing copy.
 */
function aboutFromFacts(name: string, known: { genre?: string | null; venue?: string | null; performers: string[] }): string {
  const g = (known.genre ?? "").split(/\s*·\s*/).pop()?.trim().toLowerCase();
  const kind = g && !/^(music|misc|undefined)$/.test(g) ? `${g} event` : "live event";
  const at = known.venue ? ` at ${known.venue}` : "";
  const support = known.performers.slice(1).filter(Boolean);
  const supportLine = support.length ? ` Also on the bill: ${support.slice(0, 4).join(", ")}.` : "";
  return `${name} — a ${kind}${at}.${supportLine}`.trim();
}

/** One structured pass over provider + web notes → the polished fields the page renders. */
async function enrich(
  name: string,
  known: { genre?: string | null; venue?: string | null; date?: string | null; performers: string[] },
  notes: string,
  signal?: AbortSignal,
): Promise<z.infer<typeof enrichmentSchema>> {
  const empty = { about: null, whatToExpect: null, lineupNote: null, ageInfo: null, doorsTime: null, showTime: null, admission: null };
  const text = notes.trim();
  const factsAbout = aboutFromFacts(name, known);
  if (!aiConfigured()) return { ...empty, about: factsAbout };
  try {
    const parsed = await generateStructured(
      "bulk",
      [
        {
          role: "system",
          content:
            'You clean messy event notes into a JSON object. Keys: "about", "whatToExpect", "lineupNote", "ageInfo", "doorsTime", "showTime", "admission". ' +
            '"about" = 2–4 plain sentences on what the event is and who is performing/involved. Always write a real "about": if the notes are thin, lean on the event name, genre, venue and billed acts and your general knowledge of a well-known act — but never invent dates, prices, or claims the act would dispute. ' +
            '"whatToExpect" = 1–3 sentences on the practical night: format, running time, set times, support-act order, atmosphere — only what the notes support, else null. ' +
            '"lineupNote" = one sentence naming support acts / who else is on the bill, or null. ' +
            '"ageInfo" = the age policy verbatim if stated (e.g. "18+", "All ages"), else null. ' +
            '"doorsTime" = doors/entry time if stated (e.g. "7:00 PM"), else null. "showTime" = advertised stage/start time if stated (e.g. "8:00 PM"), else null. ' +
            '"admission" = seating type if stated (e.g. "Standing room, general admission", "Reserved seating"), else null. ' +
            "Use British English. No ticket prices, no links, no source names, no marketing language, no headings, no lists. " +
            "For every field except \"about\", set it to null when the notes don't support it — never pad or guess. Output ONLY the JSON object.",
        },
        {
          role: "user",
          content:
            `Event: ${name}\n` +
            `Genre: ${known.genre ?? "unknown"} · Venue: ${known.venue ?? "unknown"} · Date: ${known.date ?? "unknown"}\n` +
            `Billed acts: ${known.performers.join(", ") || "unknown"}\n\nNotes:\n${text.slice(0, 4000) || "(none — write about from the event name / genre / venue / acts)"}`,
        },
      ],
      enrichmentSchema,
      signal,
    );
    return { ...parsed, about: parsed.about?.trim() || factsAbout };
  } catch {
    // AI unavailable / bad JSON — a clean known-facts line, never a raw ticketing dump.
    return { ...empty, about: factsAbout };
  }
}

/** The card's image hint is client-supplied and ends up in a shared cache entry and an <img src>:
 *  accept only a plain https URL of sane length (no credentials), anything else is dropped. */
function safeImageHint(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" || u.username || u.password || value.length > 500) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Full detail for one event card. Ticketmaster is the backbone (line-up, price,
 * on-sale window, doors, seat map); two targeted web searches fill in what it
 * doesn't return, and one AI pass turns the pile of notes into clean prose.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    await requireTripMember(tripId, { limit: LIMITS.enrich });
    const q = new URL(request.url).searchParams;
    const name = (q.get("name") ?? "").trim();
    const url = (q.get("url") ?? "").trim();
    const source = (q.get("source") ?? "web").trim().toLowerCase();
    const venueHint = (q.get("venue") ?? "").trim();
    const dateHint = (q.get("date") ?? "").trim();
    if (!name) return NextResponse.json({ error: "An event name is required" }, { status: 400 });

    // The cached value embeds these client hints (title/venue/date/source/image whenever Ticketmaster
    // doesn't resolve), and the cache is shared across users — so every hint is part of the key, or
    // the first caller's text would be served to everyone who opens the same event.
    const imgHint = safeImageHint(q.get("img"));
    const hints = createHash("sha256").update(JSON.stringify([name, venueHint, dateHint, source, imgHint ?? ""])).digest("hex").slice(0, 24);
    const key = `event-detail:v5:${(url || `${name}|${venueHint}`).toLowerCase()}:${hints}`;
    // The loader's result is shared, so it must not be bound to THIS caller's request signal: a
    // disconnecting first request used to abort every sub-call and store the degraded result for all.
    const sharedSignal = AbortSignal.timeout(25_000);
    let degraded: EventDetail | null = null;
    const detail = await cached<EventDetail>(key, 30 * 60_000, async () => {
      const tm = await resolveTicketmaster(name, url, venueHint, dateHint, sharedSignal);

      const title = tm?.title || name;
      const venue = tm?.venue?.name || venueHint || null;
      const date = tm?.date || dateHint || null;
      const performers = tm?.performers ?? [];

      const [lineupRes, expectRes] = await Promise.allSettled([
        webConfigured()
          ? research(`${title} ${venue ?? ""} ${date ?? ""} — full line-up, support acts, set times, doors open`.trim(), sharedSignal)
          : Promise.resolve([]),
        webConfigured()
          ? research(`${title} ${venue ?? ""} — what to expect, running time, format, age restriction, fan reviews`.trim(), sharedSignal)
          : Promise.resolve([]),
      ]);
      const lineupWeb = lineupRes.status === "fulfilled" ? lineupRes.value : [];
      const expectWeb = expectRes.status === "fulfilled" ? expectRes.value : [];
      const web = [...lineupWeb, ...expectWeb];

      const notes = [tm?.info, usefulNote(tm?.pleaseNote), ...web.map((r) => r.content)].filter(Boolean).join("\n\n");
      const ai = await enrich(title, { genre: tm?.genre, venue, date, performers }, notes, sharedSignal);

      const ticketOptions: EventDetail["ticketOptions"] = [];
      const primaryUrl = tm?.url || (ticketSellerLabel(source, url) ? url : null);
      const primarySeller = ticketSellerLabel(tm?.url ? "ticketmaster" : source, primaryUrl);
      if (primaryUrl && primarySeller) ticketOptions.push({ label: `Buy on ${primarySeller}`, url: primaryUrl });
      const alternateSeller = ticketSellerLabel(source, url);
      if (url && url !== primaryUrl && /^https?:/i.test(url) && alternateSeller) {
        ticketOptions.push({ label: `Also on ${alternateSeller}`, url });
      }

      const built = eventDetailSchema.parse({
        title,
        source: primarySeller ?? source,
        url: primaryUrl,
        imageUrl: tm?.imageUrl ?? imgHint ?? null,
        date,
        doorsTime: tm?.doorsTime ?? ai.doorsTime ?? null,
        showTime: ai.showTime ?? null,
        admission: ai.admission ?? null,
        status: tm?.status ?? null,
        venueName: venue,
        venueAddress: tm?.venue?.address ?? null,
        city: tm?.venue?.city ?? cityFrom(tm?.venue?.address) ?? cityFrom(venueHint),
        latitude: tm?.venue?.latitude ?? null,
        longitude: tm?.venue?.longitude ?? null,
        performers,
        lineupNote: ai.lineupNote,
        genre: tm?.genre ?? null,
        priceRange: tm?.priceRange ?? null,
        onSale: tm?.onSale ?? null,
        promoter: tm?.promoter ?? null,
        ageInfo: tm?.ageInfo ?? ai.ageInfo ?? null,
        about: ai.about,
        whatToExpect: ai.whatToExpect,
        pleaseNote: usefulNote(tm?.pleaseNote),
        seatmapUrl: tm?.seatmapUrl ?? null,
        ticketOptions: ticketOptions.slice(0, 4),
        sources: web.slice(0, 5).map((r) => ({ title: r.title, url: r.url })),
      } satisfies EventDetail);
      // Both web searches failing means this is a degraded detail: serve it, but don't cache it
      // (a thrown loader skips the store) so one provider hiccup isn't kept for 30 minutes.
      if (webConfigured() && lineupRes.status === "rejected" && expectRes.status === "rejected") {
        degraded = built;
        throw new Error("event detail degraded — not cached");
      }
      return built;
    }).catch((err) => {
      if (degraded) return degraded;
      throw err;
    });

    return NextResponse.json({ detail });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    return tripAuthResponse(error) ?? fail(error, "Event details are unavailable right now");
  }
}
