import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

/**
 * PredictHQ is an event-intelligence API, not a ticketing one — its value is `local_rank`
 * (0–100, how big an event is for the area) and `phq_attendance` (predicted turnout), plus
 * broad coverage and a real `active.gte/lte` date range. It carries no ticket URL, so cards
 * from here get a web-search link; when the same show also comes from Ticketmaster/Eventbrite
 * the retrieve layer keeps the ticketed copy and carries the rank across.
 *
 * ponytail: 14-day trial wiring — verify the exact field names against a live response before
 * committing to a paid plan.
 */
export type PredictHqEvent = {
  title: string;
  url: string;
  date?: string;
  startDate?: string;
  venue?: string;
  /** 0–100, higher = bigger for the area. */
  rank?: number;
  attendance?: number;
  category?: string;
};

const CATEGORIES = "concerts,festivals,performing-arts,sports,community,expos,conferences";

export async function predictHqEvents(
  query: string,
  point: [lng: number, lat: number],
  window: { start?: string; end?: string },
  signal?: AbortSignal,
  /** true for a "what's on?" sweep — filters out the zero-rank noise floor so the big stuff surfaces. */
  broad = false,
): Promise<PredictHqEvent[]> {
  const key = process.env.PREDICTHQ_API_KEY;
  if (!key) throw new Error("PREDICTHQ_API_KEY is not configured");

  const url = new URL("https://api.predicthq.com/v1/events/");
  url.searchParams.set("within", `25km@${point[1]},${point[0]}`);
  url.searchParams.set("category", CATEGORIES);
  if (query) url.searchParams.set("q", query.slice(0, 100));
  if (/^\d{4}-\d{2}-\d{2}$/.test(window.start ?? "")) url.searchParams.set("active.gte", window.start!);
  if (/^\d{4}-\d{2}-\d{2}$/.test(window.end ?? "")) url.searchParams.set("active.lte", window.end!);
  if (broad) url.searchParams.set("rank_level", "3,4,5"); // minor/moderate/major/significant/mega — drop the "insignificant" floor
  url.searchParams.set("sort", "-rank");
  url.searchParams.set("limit", "20");

  const response = await guardedFetch("predicthq", url, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`PredictHQ search failed: ${response.status}`);
  const body = (await response.json()) as {
    results?: Array<{
      title?: string;
      category?: string;
      start?: string;
      local_rank?: number;
      rank?: number;
      phq_attendance?: number;
      entities?: Array<{ type?: string; name?: string }>;
    }>;
  };

  return (body.results ?? []).flatMap((event) => {
    if (!event.title) return [];
    const day = (event.start ?? "").slice(0, 10);
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
    const venue = event.entities?.find((e) => e.type === "venue")?.name;
    return [{
      title: event.title,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${event.title} ${venue ?? ""} tickets`.trim())}`,
      // The `start` time comes back in UTC; skip it and let the ticket page carry the real time.
      date: startDate,
      startDate,
      venue,
      rank: typeof event.local_rank === "number" ? event.local_rank : event.rank,
      attendance: typeof event.phq_attendance === "number" ? event.phq_attendance : undefined,
      category: event.category,
    }];
  });
}
