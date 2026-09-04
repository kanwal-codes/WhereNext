import { dayCapacity } from "./feasibility";
import { tripDayIndex } from "@/lib/trip-dates";
import type { TripContext } from "./trip-context";

export type ReviewFinding = {
  id: string;
  kind: "itinerary" | "stay" | "transport" | "pacing" | "shortlist";
  severity: "info" | "warn";
  title: string;
  detail: string;
  /** Route within the trip that addresses it. */
  deepLink?: string;
  /** A question to hand the assistant. */
  askAssistant?: string;
};

const daysUntil = (startDate: string | null | undefined, now = Date.now()): number | null => {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`).getTime();
  return Number.isNaN(start) ? null : Math.ceil((start - now) / 86_400_000);
};

/**
 * Pure trip review. Given the loaded trip context, return the handful of things
 * worth nudging the traveller about. No IO — the route caches it and filters out
 * dismissed ids.
 */
export function reviewTrip(ctx: Pick<TripContext, "trip" | "preferences" | "itinerary" | "places" | "decisions">, now = Date.now()): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const trip = ctx.trip;
  if (!trip) return findings;

  const until = daysUntil(trip.start_date, now);
  const started = tripDayIndex(trip.start_date, now) != null;
  const soon = until != null && until <= 21 && !started;
  const kinds = new Set(ctx.decisions.map((d) => d.kind));

  // 1. No itinerary yet on a trip that's close.
  if (soon && ctx.itinerary.length === 0) {
    findings.push({
      id: "itinerary-empty",
      kind: "itinerary",
      severity: "warn",
      title: "No itinerary yet",
      detail: `The trip is ${until} day${until === 1 ? "" : "s"} out and nothing is scheduled.`,
      deepLink: "itinerary",
      askAssistant: "Draft a rough day-by-day plan for this trip.",
    });
  }

  // 2. Overpacked days.
  const capacity = dayCapacity(typeof ctx.preferences.pace === "string" ? ctx.preferences.pace : undefined);
  const perDay = new Map<number, number>();
  for (const item of ctx.itinerary) perDay.set(item.day_index, (perDay.get(item.day_index) ?? 0) + 1);
  const overloaded = [...perDay.entries()].filter(([, n]) => n > capacity).map(([d]) => d);
  if (overloaded.length) {
    findings.push({
      id: "pacing-overloaded",
      kind: "pacing",
      severity: "warn",
      title: `Day ${overloaded.join(", ")} looks packed`,
      detail: `More than ${capacity} stops once travel, queues and meals are counted.`,
      deepLink: "itinerary",
      askAssistant: `Is day ${overloaded[0]} realistic, or should it be split?`,
    });
  }

  // 3. Itinerary runs longer than the trip.
  const maxDay = Math.max(0, ...ctx.itinerary.map((i) => i.day_index));
  if (trip.duration_days && maxDay > trip.duration_days) {
    findings.push({
      id: "itinerary-overflow",
      kind: "itinerary",
      severity: "warn",
      title: "Itinerary is longer than the trip",
      detail: `Day ${maxDay} is scheduled but the trip is ${trip.duration_days} days.`,
      deepLink: "itinerary",
    });
  }

  // 4. No place to stay locked in.
  if (soon && !kinds.has("stay") && !kinds.has("stay_area")) {
    findings.push({
      id: "stay-missing",
      kind: "stay",
      severity: until != null && until <= 10 ? "warn" : "info",
      title: "No stay decided",
      detail: "You haven't locked a place to stay or even a neighbourhood yet.",
      deepLink: "stay",
      askAssistant: "Where should I base myself for this trip?",
    });
  }

  // 5. Getting there — origin differs and nothing decided.
  const origin = (trip.origin ?? "").trim();
  if (soon && origin && trip.destination && origin.toLowerCase() !== trip.destination.toLowerCase() && !kinds.has("transport") && !kinds.has("flight")) {
    findings.push({
      id: "transport-missing",
      kind: "transport",
      severity: "info",
      title: "No way there decided",
      detail: `Nothing recorded for getting from ${origin} to ${trip.destination}.`,
      deepLink: "transport",
      askAssistant: `What are the options for getting from ${origin} to ${trip.destination}?`,
    });
  }

  // 6. Lots shortlisted, none scheduled.
  const shortlisted = ctx.places.filter((p) => p.status === "saved").length;
  if (shortlisted >= 4 && ctx.itinerary.length === 0) {
    findings.push({
      id: "shortlist-unscheduled",
      kind: "shortlist",
      severity: "info",
      title: `${shortlisted} places saved, none scheduled`,
      detail: "Move the ones you're sure about onto a day.",
      deepLink: "itinerary",
    });
  }

  return findings;
}

/**
 * The findings worth emailing an owner about right now: warn-level only, not
 * already emailed, not dismissed. `notified` / `dismissed` are finding-id sets.
 *
 * ponytail: finding ids are coarse (`pacing-overloaded`, not per-day), so once an
 * owner is emailed about a kind they won't be re-emailed if a *different* day
 * later overloads. Re-notify would need content hashing.
 */
export function pendingNotifications(findings: ReviewFinding[], notified: Set<string>, dismissed: Set<string>): ReviewFinding[] {
  return findings.filter((f) => f.severity === "warn" && !notified.has(f.id) && !dismissed.has(f.id));
}
