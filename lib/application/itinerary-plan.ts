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
  intro: z.string().trim().max(200).optional(),
  days: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    subtitle: z.string().trim().max(80).optional(),
    stops: z.array(stopSchema).min(1).max(6),
  })).min(1).max(7),
});

const SYSTEM = `You draft a day-by-day plan for a trip. Return JSON only:
{"title":"4 days in <city>","intro":"<ONE sentence: the shape of the trip + one thing to book ahead>","days":[{"label":"Day 1","subtitle":"<3-5 word theme>","stops":[{"time":"Morning","title":"<place or activity>","note":"<one line: why it fits or a tip>","placeId":"<id from KNOWN PLACES, or omit>","kind":"sight"}]}]}
Rules:
- Build ONLY from KNOWN PLACES (the traveller's saved spots + what was found this turn). Never invent a venue. Too few to fill the days? Make fewer or shorter days.
- 2 to 4 stops per day, ordered by time of day: "Morning" / "Afternoon" / "Evening", or a clock time for something fixed (a show, a reservation).
- note: one short line — why it suits this traveller, or a practical tip. No fluff.
- placeId: copy the exact id from KNOWN PLACES when the stop IS that place; omit otherwise.
- kind: one of food | sight | activity | nightlife | transit | event | rest.
- Respect the traveller's pace and interests. Keep consecutive stops in the same area where you can.
- If they asked for ONE specific day, return only that day (labelled e.g. "Day 2"). Otherwise cover the whole trip length.
No preamble, no markdown.`;

/** The assistant's proposed day-by-day plan — the model chooses the stops from real places. */
export async function buildItineraryPlan(input: {
  prompt: string;
  tripSummary: string;
  evidence: RetrievedEvidence;
  tripCtx: Pick<TripContext, "places" | "itinerary" | "preferences">;
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

  try {
    const raw = await gatewayFor("resolve").generateStructured(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Traveller: ${input.tripSummary}\nPace: ${pace}\nRequest: ${input.prompt}\n\nExisting itinerary:\n${existing}\n\nKNOWN PLACES:\n${known.join("\n")}`,
        },
      ],
      withDeadline(input.signal, AI_DEADLINE_MS.sideBuilder),
    );
    const parsed = planSchema.parse(raw);
    const validIds = new Set(input.evidence.places.map((p) => p.providerId));
    return {
      type: "itinerary",
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.intro ? { intro: parsed.intro } : {}),
      days: parsed.days.map((day) => ({
        label: day.label,
        ...(day.subtitle ? { subtitle: day.subtitle } : {}),
        stops: day.stops.map((stop) => ({
          ...(stop.time ? { time: stop.time } : {}),
          title: stop.title,
          ...(stop.note ? { note: stop.note } : {}),
          ...(stop.placeId && validIds.has(stop.placeId) ? { placeId: stop.placeId } : {}),
          ...(stop.kind ? { kind: stop.kind } : {}),
        })),
      })),
    };
  } catch {
    return null;
  }
}
