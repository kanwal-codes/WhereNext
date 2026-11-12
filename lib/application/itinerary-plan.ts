import { z } from "zod";
import { AI_DEADLINE_MS, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { UsageEntry } from "@/lib/ai/pricing";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { tripCalendar, effectiveStops } from "@/lib/trip-stops";
import { runBulkBuilder } from "./bulk-builder";
import type { RetrievedEvidence } from "./retrieve";
import type { TripContext } from "./trip-context";
import type { TripBrief } from "./trip-brief";
import type { RouteLeg } from "./trip-route";
import { editTargets } from "./edit-days";
import { assignDays, SAVED, stopSchema, writeDays, type Candidate, type DayBrief, type PlanStop } from "./itinerary-days";

/** A plan can cover a whole trip: the old cap of 7 cut an 8-day trip short. Matches the day rows the add-to-trip control offers. */
const MAX_PLAN_DAYS = 30;
type PlanDay = { label: string; subtitle?: string; stops: PlanStop[]; open: boolean };
const OPEN_DAY = "Open day";
const planSchema = z.object({
  title: z.string().trim().max(80).optional(),
  intro: z.string().trim().max(420).optional(),
  days: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    subtitle: z.string().trim().max(80).optional(),
    stops: z.array(stopSchema).max(6),
  })).min(1).max(MAX_PLAN_DAYS),
});

const SYSTEM = (language: string = "en") => `You draft a day-by-day plan for a trip. Write every text field ("title", "intro", "subtitle", "note") in language "${language}" (BCP-47) — never "time" or "kind", which stay in their given formats. Return JSON only:
{"title":"<N> days in <city>","intro":"<2-3 concise sentences: how many days this covers and the shape of them, tied to what the traveller actually asked for (their cuisine, group, base) rather than generic travel talk; if days are thin or open because few places fit, say so in one clause (\"I found fewer options for days 5-8\", never calling them \"saved\" places) and invite them to name what else they want; then one thing to book ahead>","days":[{"label":"Day 1","subtitle":"<3-5 word theme>","stops":[{"time":"09:00","title":"<place or activity>","note":"<one line: why it fits or a tip>","placeId":"<id from KNOWN PLACES, or omit>","kind":"sight"}]}]}
Rules:
- Build ONLY from KNOWN PLACES (the traveller's saved spots + what was found this turn). Never invent a venue. Too few to fill the days? Keep every day: give thin days one or two stops, and a day with no known place left gets "stops":[] — never leave a day out, never invent a venue to fill it.
- 2 to 4 stops per day. Give every stop a real 24-hour clock time ("09:00", "13:30", "19:00") reflecting a sensible pace through the day — not just an ordering label. Use a specific known time (a show's start, a reservation) when there is one; otherwise pick a reasonable time for that stop's kind (e.g. breakfast ~08:30, lunch ~12:30, dinner ~19:00, a museum/sight ~10:00-15:00, nightlife ~21:00+). Leave "time" out only when the stop is genuinely flexible and no reasonable time applies.
- note: one short line — why it suits this traveller, or a practical tip. No fluff.
- placeId: copy the exact id from KNOWN PLACES when the stop IS that place; omit otherwise.
- kind: one of food | sight | activity | nightlife | transit | event | rest.
- Respect the traveller's pace and interests. Keep consecutive stops in the same area where you can.
- Never put the same place on two different days. If KNOWN PLACES runs out before the trip length does, give the later days fewer stops (or drop them) rather than repeating an earlier day's place — and make the day's subtitle match the places actually listed under it. A day with fewer stops is fine; a missing day is not.
- Label days with the TRIP's own day numbers from "Trip calendar" when it is given: a request for particular dates ("Jun 11 and 12"), a stretch of the trip or one city ("our Rome days") uses THOSE days' numbers (Day 7, Day 8), never Day 1, Day 2; only use places that belong to the city the calendar shows for those days. A whole-trip request starts at Day 1.
- Mix the days on purpose. When a TRIP BRIEF is given, build each day around one or two of its kinds, favour the heavier-weighted ones and the places the traveller is known to like, and keep every day from being all one kind (a day of nothing but restaurants is a failure). Meals are part of a day, not a day. Never use a place of a kind the traveller dislikes.
- Places tagged "day trip" are far from the city centre: put them together on ONE day, with that day's other stops nearby, and leave a long enough gap for the travel.
- If EVENTS are listed, use one or two that genuinely fit this traveller, on exactly the day shown with its time; skip the rest. An event is never a reason to drop a whole day of things to see.
- If they asked for ONE specific day, return only that day (labelled e.g. "Day 2"). Otherwise return exactly the number of days in "Days to plan" (labelled Day 1 … Day N, no day skipped or merged), or the whole trip length when none is given.
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

// Event titles from ticket sites often contain " | ", which is this prompt's own field separator: show them with " / " and match on that.
const listing = (title: string) => title.replace(/\s*\|\s*/g, " / ");
const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

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
  /** What the trip could hold (kinds of place and event, from who/where/when). Tags the known places and steers the mix of each day. */
  brief?: TripBrief | null;
  /** A plan across several places: the cities in order with the days in each, and each one's own menu of kinds (same order). */
  route?: RouteLeg[] | null;
  legBriefs?: Array<TripBrief | null>;
  /** Days the traveller asked for this turn (from the resolver). Wins over the trip's saved length. */
  requestedDays?: number | null;
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<AssistantBlock | null> {
  // One stop is ~3 per day: a fixed 12 + 12 could not fill more than a handful of days.
  const targetDays = Math.min(input.requestedDays ?? 0, MAX_PLAN_DAYS) || 0;
  // The pool follows the days being planned, the trip's own length when none were asked for.
  const poolDays = targetDays || Math.min(input.tripCtx.trip?.duration_days ?? tripDurationDays(input.tripCtx.trip?.start_date, input.tripCtx.trip?.end_date) ?? 0, MAX_PLAN_DAYS);
  const poolSize = Math.max(12, poolDays * 4);
  // Each place carries the kind of thing it was found as (from the brief), so the days can be mixed on purpose.
  const kindByQuery = new Map([...(input.brief?.kinds ?? []), ...(input.legBriefs ?? []).flatMap((leg) => leg?.kinds ?? [])].map((kind) => [kind.placeQuery, kind]));
  const kindOf = new Map<string, string>();
  // The same grouping for the day-by-day assignment: a place's kind is the search that found it (first one wins), brief or not.
  const kindInfo = new Map<string, { label: string; dayTrip: boolean }>();
  for (const group of input.evidence.placeGroups ?? []) {
    const kind = kindByQuery.get(group.label);
    if (kind) for (const place of group.places) kindOf.set(place.providerId, `${kind.label}${kind.scale === "day_trip" ? ", day trip" : ""}`);
    for (const place of group.places) if (!kindInfo.has(place.providerId)) kindInfo.set(place.providerId, { label: kind?.label ?? group.label, dayTrip: kind?.scale === "day_trip" });
  }
  const found = input.evidence.places.slice(0, poolSize).map((p) => `- ${p.name} | id:${p.providerId} | ${p.category ?? "place"}${kindOf.has(p.providerId) ? ` | kind: ${kindOf.get(p.providerId)}` : ""}${p.address ? ` | ${p.address}` : ""}`);
  const saved = input.tripCtx.places
    .filter((entry) => entry.place?.name && entry.status !== "rejected")
    .slice(0, poolSize)
    .map((entry) => `- ${entry.place!.name} | ${entry.place!.category ?? "place"}${entry.place!.address ? ` | ${entry.place!.address}` : ""} (saved, no id)`);
  const known = [...saved, ...found];
  // "Make day 3 more relaxed": the days named are rewritten from fresh candidates, side by side, and nothing else is touched. A
  // plan-wide edit, or a multi-city trip, keeps the single call that reads the whole itinerary and calendar.
  const tripStops = effectiveStops(input.tripCtx.trip).stops;
  const plannedDays = input.tripCtx.itinerary.reduce((most, item) => Math.max(most, item.day_index), 0);
  const targets = input.tripCtx.itinerary.length && tripStops.length < 2 ? editTargets(input.prompt, plannedDays) : null;
  const rawAnchorDay = input.anchorEvent ? dayIndexForDate(input.tripCtx.trip?.start_date, input.anchorEvent.date) : null;
  // An edit only has the anchor's day to deal with when that day is one of the days being rewritten.
  const anchorDay = rawAnchorDay && (!targets || targets.includes(rawAnchorDay)) ? rawAnchorDay : null;
  // The anchor alone is a valid stop, so don't bail out just because there's little else known yet.
  if (known.length < 2 && !anchorDay && !targets) return null;

  const existing = input.tripCtx.itinerary.length
    ? input.tripCtx.itinerary.map((item) => `Day ${item.day_index}: ${item.title}`).join("\n")
    : "(nothing planned yet)";
  const prefs = input.tripCtx.preferences as Record<string, unknown>;
  const pace = typeof prefs.pace === "string" ? prefs.pace : "unspecified";
  const duration = input.tripCtx.trip?.duration_days ?? tripDurationDays(input.tripCtx.trip?.start_date, input.tripCtx.trip?.end_date);
  const fresh = existing === "(nothing planned yet)";
  // What was asked beats what the trip says; an edit of some days has no target (the model copies the rest).
  const wanted = targetDays || (fresh ? Math.min(duration ?? 0, MAX_PLAN_DAYS) : 0);
  const calendar = tripCalendar(input.tripCtx.trip?.start_date, input.tripCtx.trip?.end_date, effectiveStops(input.tripCtx.trip).stops);
  const calendarBlock = calendar.length ? `\nTrip calendar (label days by these numbers):\n${calendar.join("\n")}\n` : "";
  const daysDirective = targetDays
    ? `${targetDays} (exactly ${targetDays} consecutive days; number them from the Trip calendar when the request names dates or a city, otherwise Day 1 to Day ${targetDays})`
    : wanted
      ? `${wanted}, the whole trip (unless the request names one specific day)`
      : "as the request says";
  // Events with a date inside the trip are stops of their own, on their own day, when they fit the traveller.
  const anchorKey = input.anchorEvent ? normalize(input.anchorEvent.title) : null;
  const eventOptions = input.tripCtx.trip?.start_date
    ? input.evidence.events.flatMap((event) => {
        const day = event.relToTrip === "in" ? dayIndexForDate(input.tripCtx.trip?.start_date, event.startDate ?? event.date ?? "") : null;
        return day && normalize(event.title) !== anchorKey ? [{ event, day, time: event.date?.match(/(\d{2}:\d{2})\s*$/)?.[1] }] : [];
      }).slice(0, 12)
    : [];
  const eventsBlock = eventOptions.length
    ? `\n\nEVENTS (fixed dates; use one only when it fits this traveller, on its own day, title copied exactly, kind "event"):\n${eventOptions.map(({ event, day, time }) => `- ${listing(event.title)} | Day ${day}${time ? ` | ${time}` : ""}${event.venue ? ` | ${event.venue}` : ""}`).join("\n")}`
    : "";
  const briefBlock = input.brief?.kinds.length
    ? `\n\nTRIP BRIEF (what this trip could hold; mix these across the days):\n${input.brief.famousFor ? `Famous for: ${input.brief.famousFor}\n` : ""}${input.brief.kinds.map((kind) => `- ${kind.label} (${kind.origin}, weight ${kind.weight}${kind.scale === "day_trip" ? ", day trip" : ""})${kind.why ? `: ${kind.why}` : ""}`).join("\n")}`
    : "";
  const anchorLine = anchorDay
    ? `\n\nANCHOR EVENT (already booked — must appear exactly once, on Day ${anchorDay}, kind "event", using this exact time): ${input.anchorEvent!.title}${input.anchorEvent!.venue ? ` at ${input.anchorEvent!.venue}` : ""}${input.anchorEvent!.time ? `, ${input.anchorEvent!.time}` : ""}`
    : "";

  // A whole-trip plan for one city is written day by day, side by side, from places that code has already dealt out to the days.
  // Edits of existing days, a few chosen days, and multi-city trips keep the single call, which reads the whole itinerary and calendar.
  const wholeTrip = !duration || wanted >= Math.ceil(duration * 0.6);
  const route = input.route && input.route.length >= 2 && tripStops.length < 2 ? input.route : null;
  const routeDays = route ? route.reduce((sum, leg) => sum + leg.days, 0) : 0;
  const parsed = targets
    ? await (async () => {
        const untouched = new Set(input.tripCtx.itinerary.filter((item) => !targets.includes(item.day_index)).map((item) => normalize(item.title)));
        const savedNames = new Set(input.tripCtx.places.filter((entry) => entry.place?.name && entry.status !== "rejected").map((entry) => normalize(entry.place!.name)));
        // New ideas for the days, never a place another day of the trip already holds.
        const pool: Candidate[] = [
          ...input.tripCtx.places
            .filter((entry) => entry.place?.name && entry.status !== "rejected")
            .map((entry): Candidate => ({ key: `saved:${normalize(entry.place!.name)}`, name: entry.place!.name, category: entry.place!.category ?? "place", kind: SAVED, dayTrip: false, ...(entry.place!.address ? { address: entry.place!.address } : {}) })),
          ...input.evidence.places
            .filter((p) => !savedNames.has(normalize(p.name)))
            .map((p): Candidate => ({ key: p.providerId, name: p.name, id: p.providerId, category: p.category ?? "place", kind: kindInfo.get(p.providerId)?.label ?? "Other", dayTrip: kindInfo.get(p.providerId)?.dayTrip ?? false, ...(p.address ? { address: p.address } : {}) })),
        ].filter((candidate) => !untouched.has(normalize(candidate.name))).slice(0, targets.length * 8);
        const assigned = assignDays({ candidates: pool, days: targets.length, kindOrder: [SAVED, ...(input.brief?.kinds ?? []).map((kind) => kind.label)] });
        const briefs: DayBrief[] = targets.map((number, i) => ({
          number,
          // What the day holds now comes first, so the rewrite can keep what still fits the request.
          candidates: [
            ...input.tripCtx.itinerary.filter((item) => item.day_index === number).map((item): Candidate => ({ key: `current:${normalize(item.title)}`, name: item.title, category: "in the itinerary now", kind: "Current plan", dayTrip: false })),
            ...assigned[i],
          ],
          events: eventOptions.filter((option) => option.day === number).map(({ event, time }) => `${listing(event.title)} | ${time ?? ""} | ${event.venue ?? ""}`),
          must: anchorDay === number ? `${input.anchorEvent!.title}${input.anchorEvent!.venue ? ` at ${input.anchorEvent!.venue}` : ""}${input.anchorEvent!.time ? `, ${input.anchorEvent!.time}` : ""}` : null,
        }));
        return writeDays({ days: briefs, tripSummary: input.tripSummary, prompt: input.prompt, pace, city: input.tripCtx.trip?.destination ?? "", mode: "edit", language: input.language, signal: input.signal, onUsage: input.onUsage });
      })()
    : routeDays && fresh && wanted === routeDays
    ? await (async () => {
        // City by city: a place belongs to the city its search was run in, each city's days are dealt from its own places only, and
        // the legs follow one another (Day 1..N across the route).
        const legIndex = new Map(route!.map((leg, i) => [leg.city.split(",")[0].trim().toLowerCase(), i]));
        const cityOfPlace = new Map<string, number>();
        for (const group of input.evidence.placeGroups ?? []) {
          const at = legIndex.get((group.location ?? "").split(",")[0].trim().toLowerCase());
          if (at !== undefined) for (const place of group.places) if (!cityOfPlace.has(place.providerId)) cityOfPlace.set(place.providerId, at);
        }
        const briefs: DayBrief[] = [];
        let first = 1;
        route!.forEach((leg, i) => {
          const candidates = input.evidence.places
            .filter((p) => cityOfPlace.get(p.providerId) === i)
            .map((p): Candidate => ({ key: p.providerId, name: p.name, id: p.providerId, category: p.category ?? "place", kind: kindInfo.get(p.providerId)?.label ?? "Other", dayTrip: kindInfo.get(p.providerId)?.dayTrip ?? false, ...(p.address ? { address: p.address } : {}) }));
          const assigned = assignDays({ candidates, days: leg.days, kindOrder: (input.legBriefs?.[i]?.kinds ?? []).map((kind) => kind.label) });
          assigned.forEach((dayCandidates, d) => briefs.push({ number: first + d, candidates: dayCandidates, events: [], must: null, city: leg.city }));
          first += leg.days;
        });
        return writeDays({ days: briefs, tripSummary: input.tripSummary, prompt: input.prompt, pace, city: route!.map((leg) => leg.city.split(",")[0].trim()).join(", "), language: input.language, signal: input.signal, onUsage: input.onUsage });
      })()
    : fresh && wanted >= 2 && wholeTrip && tripStops.length < 2
    ? await (async () => {
        const savedNames = new Set(input.tripCtx.places.filter((entry) => entry.place?.name && entry.status !== "rejected").map((entry) => normalize(entry.place!.name)));
        const candidates: Candidate[] = [
          ...input.tripCtx.places
            .filter((entry) => entry.place?.name && entry.status !== "rejected")
            .map((entry): Candidate => ({ key: `saved:${normalize(entry.place!.name)}`, name: entry.place!.name, category: entry.place!.category ?? "place", kind: SAVED, dayTrip: false, ...(entry.place!.address ? { address: entry.place!.address } : {}) })),
          ...input.evidence.places
            .filter((p) => !savedNames.has(normalize(p.name)))
            .slice(0, Math.max(poolSize, wanted * 5))
            .map((p): Candidate => ({ key: p.providerId, name: p.name, id: p.providerId, category: p.category ?? "place", kind: kindInfo.get(p.providerId)?.label ?? "Other", dayTrip: kindInfo.get(p.providerId)?.dayTrip ?? false, ...(p.address ? { address: p.address } : {}) })),
        ];
        const assigned = assignDays({ candidates, days: wanted, kindOrder: [SAVED, ...(input.brief?.kinds ?? []).map((kind) => kind.label)], avoid: anchorDay ? [anchorDay] : [] });
        const briefs: DayBrief[] = assigned.map((dayCandidates, i) => ({
          number: i + 1,
          candidates: dayCandidates,
          events: eventOptions.filter((option) => option.day === i + 1).map(({ event, time }) => `${listing(event.title)} | ${time ?? ""} | ${event.venue ?? ""}`),
          must: anchorDay === i + 1 ? `${input.anchorEvent!.title}${input.anchorEvent!.venue ? ` at ${input.anchorEvent!.venue}` : ""}${input.anchorEvent!.time ? `, ${input.anchorEvent!.time}` : ""}` : null,
        }));
        return writeDays({ days: briefs, tripSummary: input.tripSummary, prompt: input.prompt, pace, city: input.tripCtx.trip?.destination ?? "", language: input.language, signal: input.signal, onUsage: input.onUsage });
      })()
    : await runBulkBuilder(
    SYSTEM(input.language),
    `Traveller: ${input.tripSummary}\nTrip length: ${duration ? `${duration} days` : "unspecified"}\nDays to plan: ${daysDirective}\n${calendarBlock}Pace: ${pace}\nRequest: ${input.prompt}\n\nExisting itinerary:\n${existing}\n\nKNOWN PLACES:\n${known.join("\n")}${briefBlock}${eventsBlock}${anchorLine}`,
    planSchema,
    // Writing a plan takes about 2 s per day (17 s for 5 days, the same for 8 on a good run): a flat 22 s cut longer plans off
    // mid-answer and threw the whole thing away for a prose reply.
    withDeadline(input.signal, Math.min(75_000, Math.max(AI_DEADLINE_MS.sideBuilder, 10_000 + (wanted || poolDays || 3) * 3_500))),
    input.onUsage,
  );
  if (!parsed) return null;
  const byId = new Map(input.evidence.places.map((p) => [p.providerId, p]));
    const byName = new Map<string, { name: string; providerId?: string }>();
    // What the itinerary already holds can be kept as the title it has, with no provider id to carry.
    for (const item of input.tripCtx.itinerary) byName.set(normalize(item.title), { name: item.title });
    for (const entry of input.tripCtx.places) {
      if (entry.status !== "rejected" && entry.place) byName.set(normalize(entry.place.name), entry.place);
    }
    for (const place of input.evidence.places) byName.set(normalize(place.name), place);
    const anchorTitle = anchorKey;
    const eventByTitle = new Map(eventOptions.map((option) => [normalize(listing(option.event.title)), option]));
    const usedEvents = new Set<string>();
    const anchorStop: PlanStop | null = anchorDay
      ? { ...(input.anchorEvent!.time ? { time: input.anchorEvent!.time } : {}), title: input.anchorEvent!.title, ...(input.anchorEvent!.venue ? { note: input.anchorEvent!.venue } : {}), kind: "event" }
      : null;
    let anchorPlaced = false;
    // The model still sometimes reaches for an earlier day's place once KNOWN PLACES runs thin
    // (seen live: a 7-day plan repeating Central Park / Times Square / Rockefeller Center 2-3x
    // on the last few days) despite being told not to. Enforce it here rather than trust the
    // prompt: a place already used on an earlier day is dropped, not repeated.
    const usedPlaces = new Set<string>();
    const all: PlanDay[] = parsed.days.map((day, i) => {
      const dayNumber = Number(day.label.match(/\d+/)?.[0]) || i + 1;
      const onAnchorDay = dayNumber === anchorDay;
      const stops: PlanStop[] = day.stops.flatMap((stop): PlanStop[] => {
        // The event isn't in KNOWN PLACES, so it fails the usual place lookup below — recognize
        // it by title on its own day instead of requiring a place match.
        if (onAnchorDay && anchorTitle && normalize(stop.title) === anchorTitle) {
          anchorPlaced = true;
          return [anchorStop!];
        }
        // A listed event is only real on its own day, and once.
        const listed = eventByTitle.get(normalize(stop.title));
        if (listed && !stop.placeId) {
          if (listed.day !== dayNumber || usedEvents.has(normalize(listed.event.title))) return [];
          usedEvents.add(normalize(listed.event.title));
          return [{ ...((listed.time ?? stop.time) ? { time: listed.time ?? stop.time } : {}), title: listed.event.title, ...(listed.event.venue ?? stop.note ? { note: listed.event.venue ?? stop.note } : {}), kind: "event" }];
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
      return { label: day.label, ...(day.subtitle ? { subtitle: day.subtitle } : {}), stops, open: false };
    });
    // A day count (asked for, or the trip's own length on a fresh build) keeps its days even when one ran out of places;
    // otherwise a day with nothing in it is dropped. Live-caught: a 5-day trip came back as 3 days with no sign of the
    // other two, because days that lost every stop to the place-matching and no-repeat filters were silently dropped.
    const keepEmpty = Boolean(wanted && fresh);
    const days: PlanDay[] = all.filter((day) => keepEmpty || day.stops.length > 0).map((day) => (day.stops.length ? day : { ...day, subtitle: OPEN_DAY, open: true }));
    // The model dropped the anchor's entire day (common when it runs out of known places before
    // reaching it). Append a fresh day for it rather than silently lose the trip's whole reason —
    // but only for a full-trip build, not a partial edit that deliberately didn't touch that day.
    if (anchorDay && anchorStop && !anchorPlaced && !targets && (existing === "(nothing planned yet)" || parsed.days.length > 1)) {
      days.push({ label: `Day ${anchorDay}`, stops: [anchorStop], open: false });
      days.sort((a, b) => (Number(a.label.match(/\d+/)?.[0]) || 0) - (Number(b.label.match(/\d+/)?.[0]) || 0));
    }
    // Asked for N days, got fewer (the model skipped one, or a day lost all its stops): keep the count honest with an
    // open day (no stops, flagged `open`, which the card explains) rather than hand back a shorter plan than the one requested. Fresh builds only, an edit keeps its days.
    if (wanted && fresh && days.length) {
      // ...and never more: a sixth day on a five-day ask is as wrong as a missing one. The window starts where the
      // plan starts: Day 1 for a whole-trip plan, a later trip day for "Jun 11 and 12" or "our Rome days".
      const first = Math.min(...days.map((d, i) => Number(d.label.match(/\d+/)?.[0]) || i + 1)) || 1;
      const last = first + wanted - 1;
      for (let i = days.length - 1; i >= 0; i--) if ((Number(days[i].label.match(/\d+/)?.[0]) || i + 1) > last) days.splice(i, 1);
      const have = new Set(days.map((d) => Number(d.label.match(/\d+/)?.[0]) || 0));
      for (let n = first; n <= last; n++) {
        if (!have.has(n)) days.push({ label: `Day ${n}`, subtitle: OPEN_DAY, stops: [], open: true });
      }
      days.sort((a, b) => (Number(a.label.match(/\d+/)?.[0]) || 0) - (Number(b.label.match(/\d+/)?.[0]) || 0));
    }
  // A plan of nothing but open days says nothing: let the turn fall back to a normal answer instead.
  if (!days.some((day) => day.stops.length > 0)) return null;
  // The model titles the plan before padding and trimming ("3 days in Toronto"): when the plan was held to a day count, the card's own count wins.
  const title = wanted && fresh && days.length > 1 ? parsed.title?.replace(/^\d+(?=\s*[-–]?\s*days?\b)/i, String(days.length)) : parsed.title;
  return {
    type: "itinerary",
    ...(title ? { title } : {}),
    ...(parsed.intro ? { intro: parsed.intro } : {}),
    // The days are a rework of days the trip already has: applying the card replaces them instead of piling stops on top.
    ...(targets ? { replacesDays: true } : {}),
    days: days.map(({ open, ...day }) => (open ? { ...day, open: true } : day)),
  };
}
