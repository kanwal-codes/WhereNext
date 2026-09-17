import { events } from "@/packages/providers/ticketmaster/client";
import { localEvents } from "@/packages/providers/eventbrite/client";
import { cached } from "@/lib/server/ttl-cache";
import type { ToolCall } from "../../turn-resolver";
import type { RetrieveContext } from "../context";
import { RESEARCH_CACHE_MS } from "../context";
import type { EventResult } from "../../retrieve";
import { dedupeByFuzzyMatch } from "../dedupe";

/** First 10 chars of a date string, when they're a valid ISO day. */
function isoDay(value?: string): string | undefined {
  const day = (value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : undefined;
}
/** `iso` shifted by `days` (may be negative), as an ISO day. */
function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Whole days from `fromIso` to `toIso` (assumes `toIso >= fromIso`). */
function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// Ticketmaster/Eventbrite keyword search matches all words — a raw question
// ("are there any punjabi concerts between my dates in Montreal") matches nothing.
// Keep only the meaningful terms (artist / genre / type).
const EVENT_STOPWORDS = new Set([
  "a", "an", "the", "any", "are", "is", "there", "any", "some", "in", "on", "at", "near", "around", "to", "of", "for",
  "concert", "concerts", "show", "shows", "gig", "gigs", "event", "events", "ticket", "tickets", "performance",
  "between", "during", "this", "that", "my", "our", "we", "i", "planning", "plan", "go", "going", "visit", "trip",
  "date", "dates", "day", "days", "weekend", "week", "happening", "on", "while", "when", "and", "or",
  "anything", "something", "everything", "stuff", "things", "thing", "here", "out", "up", "get",
]);
export function cleanEventKeyword(query: string, location: string): string {
  const locWords = new Set(location.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const kept = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !EVENT_STOPWORDS.has(w) && !locWords.has(w));
  return kept.join(" ").slice(0, 60);
}

type EventsCall = Extract<ToolCall, { tool: "events" }>;

// Ticketmaster + Eventbrite only. GetYourGuide used to also feed this (undated tours/
// experiences) but was removed with the rest of its data-fetching (Phase 0) — the app is only a
// GYG affiliate now (an outbound link, see `getYourGuideHref` in `lib/places-ui.ts`), it shows no
// GYG content or search results anywhere, events included. PredictHQ's removal is a cost decision
// documented on `EventResult.rank` above instead — GYG's was a business-model one.
export async function handleEvents(call: EventsCall, ctx: RetrieveContext): Promise<void> {
  const wantTicketmaster = Boolean(process.env.TICKETMASTER_CONSUMER_KEY || process.env.TICKETMASTER_API_KEY);
  const wantEventbrite = Boolean(process.env.EVENTBRITE_API_KEY);
  // Most specific term wins: a named act, else the kind of event, else the cleaned message.
  const keyword = call.artist || call.category || cleanEventKeyword(call.query, call.location);
  const broad = !keyword; // "what's on?" with nothing specific -> order by pull, not by date
  if (broad) ctx.eventsBroad = true;

  // Query a BUFFER either side of the trip so we can also talk about near-misses
  // ("X plays 5 days after you leave"). Wider for a named act — a miss-by-a-week still matters.
  const bufferDays = call.artist ? 30 : 14;
  const scoped = call.dateScoped !== false && Boolean(ctx.filters.tripStart && ctx.filters.tripEnd);
  const bufStart = scoped ? shiftIsoDate(ctx.filters.tripStart!, -bufferDays) : undefined;
  const bufEnd = scoped ? shiftIsoDate(ctx.filters.tripEnd!, bufferDays) : undefined;

  // Not awaited here — ticketmaster doesn't need a geocoded point at all, so sequencing
  // the whole branch behind this lookup made it wait for nothing. eventbrite picks this
  // promise up from inside the Promise.all below instead.
  const point = wantEventbrite ? ctx.geocode(call.location) : Promise.resolve(null);
  const eventLoc = call.location.trim().toLowerCase();
  const eventKw = keyword.trim().toLowerCase();
  const [tm, eb] = await Promise.all([
    // Shared across callers, same reasoning as weather/stays/research_web — "what's on this
    // weekend" is exactly the kind of question multiple trip members ask independently, or one
    // re-asks minutes later. Not tied to this call's signal — the cached load is shared, so one
    // caller's abort must not cancel it out for another.
    wantTicketmaster
      ? cached(`events:tm:${eventKw}:${eventLoc}:${bufStart ?? ""}:${bufEnd ?? ""}:${broad ? "relevance" : "date"}`, RESEARCH_CACHE_MS, () =>
          events(keyword, call.location, { start: bufStart, end: bufEnd }, undefined, broad ? "relevance" : "date"),
        ).catch(ctx.fail("ticketmaster"))
      : Promise.resolve(undefined),
    wantEventbrite
      ? point.then((p) =>
          p ? cached(`events:eb:${eventKw}:${p[1]},${p[0]}`, RESEARCH_CACHE_MS, () => localEvents(keyword, p[1], p[0])).catch(ctx.fail("eventbrite")) : undefined,
        )
      : Promise.resolve(undefined),
  ]);

  // Phase 5 (docs/overhaul/roadmap/phase-5-optional-improvements.md) — the same real-world event
  // is often listed on both Ticketmaster and Eventbrite; a plain concatenation used to show it
  // twice. Ticketmaster listed first so it wins a match (richer data — it's the one with images).
  const raw: EventResult[] = dedupeByFuzzyMatch([
    ...(tm ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "ticketmaster", imageUrl: e.imageUrl, startDate: isoDay(e.date) })),
    ...(eb ?? []).map((e) => ({ title: e.title, url: e.url, date: e.date, venue: e.venue, source: "eventbrite", startDate: isoDay(e.date) })),
  ]);

  const artistWords = call.artist ? call.artist.toLowerCase().split(/\s+/).filter((w) => w.length > 2) : [];
  for (const event of raw) {
    // A named-act query only ever shows that act.
    if (artistWords.length) {
      const title = event.title.toLowerCase();
      if (!artistWords.every((w) => title.includes(w))) continue;
    }
    if (scoped) {
      // Can't place it, or it's outside the buffer -> not relevant to this trip.
      if (!event.startDate || event.startDate < bufStart! || event.startDate > bufEnd!) continue;
      if (event.startDate >= ctx.filters.tripStart! && event.startDate <= ctx.filters.tripEnd!) {
        event.relToTrip = "in";
        event.offsetDays = 0;
      } else if (event.startDate < ctx.filters.tripStart!) {
        event.relToTrip = "before";
        event.offsetDays = daysBetweenIso(event.startDate, ctx.filters.tripStart!);
      } else {
        event.relToTrip = "after";
        event.offsetDays = daysBetweenIso(ctx.filters.tripEnd!, event.startDate);
      }
    }
    ctx.eventList.push(event);
  }
}
