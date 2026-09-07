import { z } from "zod";
import { AI_DEADLINE_MS, gatewayFor, withDeadline } from "@/packages/ai/model-policy";
import type { AssistantBlock } from "@/packages/contracts/assistant";
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

const SYSTEM = `You draft a day-by-day plan for a trip. Return JSON only:
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
No preamble, no markdown.`;

/** The assistant's proposed day-by-day plan — the model chooses the stops from real places. */
export async function buildItineraryPlan(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "places" | "itinerary" | "preferences"> & { trip?: TripContext["trip"] };
  signal?: AbortSignal;
}): Promise<AssistantBlock | null> {
  const found = input.evidence.places.slice(0, 12).map((p) => `- ${p.name} | id:${p.providerId} | ${p.category ?? "place"}${p.address ? ` | ${p.address}` : ""}`);
  const saved = input.tripCtx.places
    .filter((entry) => entry.place?.name && entry.status !== "rejected")
    .slice(0, 12)
    .map((entry) => `- ${entry.place!.name} | ${entry.place!.category ?? "place"}${entry.place!.address ? ` | ${entry.place!.address}` : ""} (saved, no id)`);
  const known = [...saved, ...found];
  if (known.length < 2) return null;

  const existing = input.tripCtx.itinerary.length
    ? input.tripCtx.itinerary.map((item) => `Day ${item.day_index}: ${item.title}`).join("\n")
    : "(nothing planned yet)";
  const prefs = input.tripCtx.preferences as Record<string, unknown>;
  const pace = typeof prefs.pace === "string" ? prefs.pace : "unspecified";
  const duration = input.tripCtx.trip?.duration_days;

  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Traveller: ${input.tripSummary}\nTrip length: ${duration ? `${duration} days` : "unspecified"}\nPace: ${pace}\nRequest: ${input.prompt}\n\nExisting itinerary:\n${existing}\n\nKNOWN PLACES:\n${known.join("\n")}`,
        },
      ],
      withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = planSchema.parse(raw);
    const byId = new Map(input.evidence.places.map((p) => [p.providerId, p]));
    const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const byName = new Map<string, { name: string; providerId?: string }>();
    for (const entry of input.tripCtx.places) {
      if (entry.status !== "rejected" && entry.place) byName.set(normalize(entry.place.name), entry.place);
    }
    for (const place of input.evidence.places) byName.set(normalize(place.name), place);
    // The model still sometimes reaches for an earlier day's place once KNOWN PLACES runs thin
    // (seen live: a 7-day plan repeating Central Park / Times Square / Rockefeller Center 2-3x
    // on the last few days) despite being told not to. Enforce it here rather than trust the
    // prompt: a place already used on an earlier day is dropped, not repeated.
    const usedPlaces = new Set<string>();
    const days = parsed.days.map((day) => ({
      label: day.label,
      ...(day.subtitle ? { subtitle: day.subtitle } : {}),
      stops: day.stops.flatMap((stop) => {
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
      }),
    })).filter((day) => day.stops.length > 0);
    if (!days.length) return null;
    return {
      type: "itinerary",
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.intro ? { intro: parsed.intro } : {}),
      days,
    };
  } catch {
    return null;
  }
}
