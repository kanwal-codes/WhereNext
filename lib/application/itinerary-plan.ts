import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { runBulkBuilder } from "./bulk-builder";
import type { RetrievedEvidence } from "./retrieve";
import type { TripContext } from "./trip-context";

const stopSchema = z.object({
  time: z.string().trim().max(20).optional(),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).optional(),
  placeId: z.string().trim().max(240).optional(),
  kind: z.enum(["food", "sight", "activity", "nightlife", "transit", "event", "rest"]).optional(),
});
const planSchema = z.object({
  title: z.string().trim().max(80).optional(),
  intro: z.string().trim().max(420).optional(),
  days: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    subtitle: z.string().trim().max(80).optional(),
    stops: z.array(stopSchema).min(1).max(6),
  })).min(1).max(7),
});
type PlanStop = z.infer<typeof stopSchema>;

const SYSTEM = (language: string = "en") => `You draft a day-by-day plan for a trip. Write every text field ("title", "intro", "subtitle", "note") in language "${language}" (BCP-47) — never "time" or "kind", which stay in their given formats. Return JSON only:
{"title":"7 days in <city>","intro":"<2-3 concise sentences: the shape of the trip, why the pacing fits, and one or two things to book ahead>","days":[{"label":"Day 1","subtitle":"<3-5 word theme>","stops":[{"time":"09:00","title":"<place or activity>","note":"<one line: why it fits or a tip>","placeId":"<id from KNOWN PLACES, or omit>","kind":"sight"}]}]}
Rules:
- Build ONLY from KNOWN PLACES (the traveller's saved spots + what was found this turn). Never invent a venue. Too few to fill the days? Make fewer or shorter days.
- 2 to 4 stops per day. Give every stop a real 24-hour clock time ("09:00", "13:30", "19:00") reflecting a sensible pace through the day — not just an ordering label. Use a specific known time (a show's start, a reservation) when there is one; otherwise pick a reasonable time for that stop's kind (e.g. breakfast ~08:30, lunch ~12:30, dinner ~19:00, a museum/sight ~10:00-15:00, nightlife ~21:00+). Leave "time" out only when the stop is genuinely flexible and no reasonable time applies.
- note: one short line — why it suits this traveller, or a practical tip. No fluff.
- placeId: copy the exact id from KNOWN PLACES when the stop IS that place; omit otherwise.
- kind: one of food | sight | activity | nightlife | transit | event | rest.
- Respect the traveller's pace and interests. Keep consecutive stops in the same area where you can.
- Never put the same place on two different days. If KNOWN PLACES runs out before the trip length does, give the later days fewer stops (or drop them) rather than repeating an earlier day's place — and make the day's subtitle match the places actually listed under it.
- If they asked for ONE specific day, return only that day (labelled e.g. "Day 2"). Otherwise cover the whole trip length.
- If Existing itinerary below is non-empty and the request only targets some days ("redo days 5-7", "swap out the last two days", "change day 3"), this is an EDIT: output every day of the existing plan, copying the days NOT mentioned exactly as they already are (same day number, same stop titles) and only replacing the ones asked for. Never shrink the trip to just the edited days.
- If an ANCHOR EVENT is given below, it is already booked and non-negotiable — it MUST appear as a stop, exactly once, on the exact day named, with kind "event" and its given time (copy the title/venue/time verbatim). Build that day around it: keep the hours before an evening event light, and don't schedule anything else at a conflicting time. Never move, drop, or duplicate it, even if you'd otherwise have picked a different pace for that day.
No preamble, no markdown.`;


/** 1-based day index for a calendar date within a trip, or null if there's no start date or the
 *  date falls outside a sane trip-length range. `day_index` is 1-based everywhere it's written
 *  (see trip-context.ts) — day 1 is the trip's start_date. */
export function dayIndexForDate(startDate: string | null | undefined, targetIso: string): number | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}/.test(targetIso)) return null;
  const days = Math.round((Date.parse(targetIso.slice(0, 10)) - Date.parse(startDate)) / 86_400_000) + 1;
  return days >= 1 && days <= 60 ? days : null;
}

export type AnchorEvent = { title: string; venue?: string; date: string; time?: string };

/** The assistant's proposed day-by-day plan — the model chooses the stops from real places. */
export async function buildItineraryPlan(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "places" | "itinerary" | "preferences"> & { trip?: TripContext["trip"] };
  /** A ticketed event the traveller is building this trip around — already booked, must land on
   *  the day matching its real date. Null when there's no single clear anchor, or no trip
   *  start_date yet to place it against (the event still shows as its own card either way). */
  anchorEvent?: AnchorEvent | null;
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<AssistantBlock | null> {
  const found = input.evidence.places.slice(0, 12).map((p) => `- ${p.name} | id:${p.providerId} | ${p.category ?? "place"}${p.address ? ` | ${p.address}` : ""}`);
  const saved = input.tripCtx.places
    .filter((entry) => entry.place?.name && entry.status !== "rejected")
    .slice(0, 12)
    .map((entry) => `- ${entry.place!.name} | ${entry.place!.category ?? "place"}${entry.place!.address ? ` | ${entry.place!.address}` : ""} (saved, no id)`);
  const known = [...saved, ...found];
  const anchorDay = input.anchorEvent ? dayIndexForDate(input.tripCtx.trip?.start_date, input.anchorEvent.date) : null;
  // The anchor alone is a valid stop, so don't bail out just because there's little else known yet.
  if (known.length < 2 && !anchorDay) return null;

  const existing = input.tripCtx.itinerary.length
    ? input.tripCtx.itinerary.map((item) => `Day ${item.day_index}: ${item.title}`).join("\n")
    : "(nothing planned yet)";
  const prefs = input.tripCtx.preferences as Record<string, unknown>;
  const pace = typeof prefs.pace === "string" ? prefs.pace : "unspecified";
  const duration = input.tripCtx.trip?.duration_days;
  const anchorLine = anchorDay
    ? `\n\nANCHOR EVENT (already booked — must appear exactly once, on Day ${anchorDay}, kind "event", using this exact time): ${input.anchorEvent!.title}${input.anchorEvent!.venue ? ` at ${input.anchorEvent!.venue}` : ""}${input.anchorEvent!.time ? `, ${input.anchorEvent!.time}` : ""}`
    : "";

  const parsed = await runBulkBuilder(
    SYSTEM(input.language),
    `Traveller: ${input.tripSummary}\nTrip length: ${duration ? `${duration} days` : "unspecified"}\nPace: ${pace}\nRequest: ${input.prompt}\n\nExisting itinerary:\n${existing}\n\nKNOWN PLACES:\n${known.join("\n")}${anchorLine}`,
    planSchema,
    withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    input.onUsage,
  );
  if (!parsed) return null;
  const byId = new Map(input.evidence.places.map((p) => [p.providerId, p]));
    const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const byName = new Map<string, { name: string; providerId?: string }>();
    for (const entry of input.tripCtx.places) {
      if (entry.status !== "rejected" && entry.place) byName.set(normalize(entry.place.name), entry.place);
    }
    for (const place of input.evidence.places) byName.set(normalize(place.name), place);
    const anchorTitle = input.anchorEvent ? normalize(input.anchorEvent.title) : null;
    const anchorStop: PlanStop | null = anchorDay
      ? { ...(input.anchorEvent!.time ? { time: input.anchorEvent!.time } : {}), title: input.anchorEvent!.title, ...(input.anchorEvent!.venue ? { note: input.anchorEvent!.venue } : {}), kind: "event" }
      : null;
    let anchorPlaced = false;
    // The model still sometimes reaches for an earlier day's place once KNOWN PLACES runs thin
    // (seen live: a 7-day plan repeating Central Park / Times Square / Rockefeller Center 2-3x
    // on the last few days) despite being told not to. Enforce it here rather than trust the
    // prompt: a place already used on an earlier day is dropped, not repeated.
    const usedPlaces = new Set<string>();
    const days = parsed.days.map((day, i) => {
      const dayNumber = Number(day.label.match(/\d+/)?.[0]) || i + 1;
      const onAnchorDay = dayNumber === anchorDay;
      const stops: PlanStop[] = day.stops.flatMap((stop): PlanStop[] => {
        // The event isn't in KNOWN PLACES, so it fails the usual place lookup below — recognize
        // it by title on its own day instead of requiring a place match.
        if (onAnchorDay && anchorTitle && normalize(stop.title) === anchorTitle) {
          anchorPlaced = true;
          return [anchorStop!];
        }
        const place = stop.placeId ? byId.get(stop.placeId) : byName.get(normalize(stop.title));
        if (!place) return [];
        const key = place.providerId ?? normalize(place.name);
        if (usedPlaces.has(key)) return [];
        usedPlaces.add(key);
        return [{
          ...(stop.time ? { time: stop.time } : {}),
          title: place.name,
          ...(stop.note ? { note: stop.note } : {}),
          ...(place.providerId ? { placeId: place.providerId } : {}),
          ...(stop.kind ? { kind: stop.kind } : {}),
        }];
      });
      // Model dropped or mistitled the anchor on its own day — splice it in rather than lose the
      // one stop the whole trip is being built around. Placed first; a real evening show is late
      // enough that the model's own stops (already filtered above) still read as "earlier that day".
      if (onAnchorDay && anchorStop && !anchorPlaced) {
        anchorPlaced = true;
        stops.unshift(anchorStop);
      }
      return { label: day.label, ...(day.subtitle ? { subtitle: day.subtitle } : {}), stops };
    }).filter((day) => day.stops.length > 0);
    // The model dropped the anchor's entire day (common when it runs out of known places before
    // reaching it). Append a fresh day for it rather than silently lose the trip's whole reason —
    // but only for a full-trip build, not a partial edit that deliberately didn't touch that day.
    if (anchorDay && anchorStop && !anchorPlaced && (existing === "(nothing planned yet)" || parsed.days.length > 1)) {
      days.push({ label: `Day ${anchorDay}`, stops: [anchorStop] });
      days.sort((a, b) => (Number(a.label.match(/\d+/)?.[0]) || 0) - (Number(b.label.match(/\d+/)?.[0]) || 0));
    }
  if (!days.length) return null;
  return {
    type: "itinerary",
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.intro ? { intro: parsed.intro } : {}),
    days,
  };
}
