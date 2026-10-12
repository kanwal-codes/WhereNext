import type { AssistantBlock } from "@/packages/contracts/assistant";
import type { TripContext } from "./trip-context";

type TripSummary = Extract<AssistantBlock, { type: "trip_summary" }>;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : text(value) ? [text(value)] : []);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "What do we have so far?" as a card: the saved facts of the trip, from the trip itself, never from the model. */
export function buildTripSummary(ctx: TripContext): TripSummary | null {
  const trip = ctx.trip;
  if (!trip) return null;
  const prefs = ctx.preferences;
  const budget = typeof prefs.budget === "number" && prefs.budget > 0 ? `${prefs.budget}${text(prefs.currency) ? ` ${text(prefs.currency)}` : ""} per person a day` : text(prefs.budget);
  const dates = trip.start_date && trip.end_date ? `${trip.start_date} to ${trip.end_date}` : null;
  const stops = ctx.itinerary.length;
  const planDays = new Set(ctx.itinerary.map((item) => item.day_index)).size;
  const saved = ctx.places.filter((p) => p.place).length;
  const live = (ctx.reservations ?? []).filter((r) => !r.cancelled);
  const bookedStays = live.filter((r) => r.kind === "stay").map((r) => r.title);
  const stay = ctx.lockedStay?.hotelName ?? (bookedStays.length ? bookedStays.slice(0, 3).join(", ") + (bookedStays.length > 3 ? ` and ${bookedStays.length - 3} more` : "") : null);
  const kinds = live.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
  const NOUNS: Record<string, [string, string]> = { activity: ["activity", "activities"], dining: ["table", "tables"] };
  const bookedNote = Object.entries(kinds).map(([kind, n]) => `${n} ${(NOUNS[kind] ?? [kind, `${kind}s`])[n === 1 ? 0 : 1]}`).join(", ");
  const likes = list(prefs.likes).concat(list(prefs.interests));

  const facts: TripSummary["facts"] = [
    { label: "Dates", value: dates ?? "Not set", ...(trip.duration_days ? { note: plural(trip.duration_days, "day") } : {}) },
    { label: "Travellers", value: trip.travelers ? String(trip.travelers) : "Not set" },
    { label: "Budget", value: budget || "Not set" },
  ];
  const rows: TripSummary["rows"] = [
    trip.origin ? { label: "From", value: trip.origin } : null,
    stay ? { label: "Staying at", value: stay } : { label: "Staying at", value: "Not chosen yet" },
    live.length ? { label: "Booked", value: `${plural(live.length, "booking")} (${bookedNote})`.slice(0, 200) } : null,
    { label: "Plan", value: stops ? `${plural(stops, "stop")} over ${plural(planDays, "day")}` : "Nothing planned yet" },
    saved ? { label: "Saved places", value: String(saved) } : null,
    // "Solo" is the default group type; beside several travellers it reads as a contradiction.
    text(prefs.groupType) && !(/^solo$/i.test(text(prefs.groupType)) && (trip.travelers ?? 1) > 1) ? { label: "Group", value: text(prefs.groupType) } : null,
    text(prefs.pace) ? { label: "Pace", value: text(prefs.pace) } : null,
    list(prefs.dietaryNeeds).length ? { label: "Dietary", value: list(prefs.dietaryNeeds).join(", ") } : null,
    list(prefs.accessibilityNeeds).length ? { label: "Accessibility", value: list(prefs.accessibilityNeeds).join(", ") } : null,
    likes.length ? { label: "Into", value: [...new Set(likes)].slice(0, 6).join(", ") } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row)).slice(0, 10);

  if (!trip.destination && !dates && rows.length <= 2) return null;
  return { type: "trip_summary", title: trip.destination ? `Your trip to ${trip.destination}` : trip.name || "Your trip", facts, rows };
}

/** Only an ask for the whole picture gets the card; "remind me our dates" is a one-line answer. */
export const asksForOverview = (message: string): boolean =>
  /\b(so far|what (do|have) we (got|have|saved|planned|booked)|what'?s (saved|planned|booked)|summar(y|ise|ize)|overview|recap|where (are|do) we (stand|at)|state of (the|our) trip)\b/i.test(message);
