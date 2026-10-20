import { formatMoney, resolveCurrency } from "@/lib/currency";
import { certaintyFor, decisionSummary, isDisplayableDecision } from "@/lib/decisions-ui";
import type { Certainty } from "@/lib/design";
import { readStayDecision } from "@/packages/contracts/stay";
import { readSuggestions, type SuggestionKey } from "@/packages/contracts/suggestion";

export type Decision = { id: string; kind: string; value: Record<string, unknown>; source: string; created_at?: string };
export type PrefKey = "budget" | "groupType" | "pace" | "interests" | "dislikes" | "dietaryNeeds" | "occasion" | "arrival" | "transport";
export type TripField = "destination" | "travelers";
export type TripFacts = { destination: string; travelers: number | null };
export type TripDates = { start: string; end: string };

export type Row = {
  id: string;
  label: string;
  value: string;
  certainty: Certainty;
  editKey?: PrefKey;
  /** Editable but not through the memory PUT — currently just the trip date range. */
  editable?: boolean;
  /** A core trip column edited via PATCH /api/trips/[id]. */
  tripField?: TripField;
  suggestionKey?: SuggestionKey;
  note?: string;
};

const csv = (value: unknown): string =>
  Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
const toList = (value: string): string[] => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const fmtDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/** What a typed preference is saved as: a list for the list-valued ones, a number for a numeric budget, otherwise trimmed text. */
export function prefValue(key: PrefKey, raw: string): unknown {
  const multi = key === "interests" || key === "dislikes" || key === "dietaryNeeds";
  return multi ? toList(raw) : key === "budget" && raw.trim() && !Number.isNaN(Number(raw)) ? Number(raw) : raw.trim();
}

/** Why a typed headcount cannot be saved, or null. */
export const travellersError = (value: string): string | null =>
  value && !/^\d+$/.test(value) ? "Enter the number of travellers as a whole number." : null;

/** Why a date range cannot be saved, or null. */
export const datesError = (start: string, end: string): string | null =>
  start && end && end < start ? "The end date is before the start date." : null;

/** The date range as one line: "1 Dec 2026 – 8 Dec 2026", "From 1 Dec 2026", or "" without dates. */
export const dateRangeText = (dates: TripDates): string =>
  dates.start && dates.end ? `${fmtDate(dates.start)} – ${fmtDate(dates.end)}` : dates.start ? `From ${fmtDate(dates.start)}` : "";

/**
 * The trip's facts in the order the panel shows them. Each is confirmed (known), suggested (the assistant inferred it and
 * awaits a yes), or undecided; a suggestion carries the key that confirms or dismisses it.
 */
export function buildRows(input: {
  /** Only the trip's planned length is read from it. */
  trip: { duration_days?: number | null } | null;
  tripFacts: TripFacts;
  tripDates: TripDates;
  memory: Record<string, unknown>;
  decisions: Decision[];
}): Row[] {
  const { trip, tripFacts, tripDates, memory, decisions } = input;
  const suggestions = readSuggestions(decisions);
  const suggestionFor = (key: SuggestionKey) => suggestions.find((s) => s.key === key);
  const lockedStay = readStayDecision(decisions);
  const realDecisions = decisions.filter((d) => isDisplayableDecision(d.kind));

  const rows: Row[] = [];
  const push = (r: Row) => rows.push(r);

  if (tripFacts.destination) {
    push({ id: "destination", label: "Destination", value: tripFacts.destination, certainty: "confirmed", tripField: "destination" });
  } else {
    // A place only ever implied ("I want to see the Eiffel Tower"), never stated as the
    // destination outright — confirm before it becomes the trip, same as any inferred fact.
    const s = suggestionFor("destination");
    if (s) push({ id: "destination", label: "Destination", value: s.display, certainty: "suggested", suggestionKey: "destination", note: s.rationale });
    else push({ id: "destination", label: "Destination", value: "", certainty: "undecided", tripField: "destination" });
  }

  if (trip?.duration_days) {
    push({ id: "length", label: "Trip length", value: `${trip.duration_days} days`, certainty: "confirmed" });
  } else {
    const s = suggestionFor("trip_length");
    if (s) push({ id: "length", label: "Trip length", value: s.display, certainty: "suggested", suggestionKey: "trip_length", note: s.rationale });
    else push({ id: "length", label: "Trip length", value: "", certainty: "undecided" });
  }
  // "Solo" already answers headcount unambiguously — don't leave this stuck in "to decide"
  // (and thus looking unknown) when the chat already locked in who's travelling.
  const impliedSoloCount = /\bsolo\b/i.test(csv(memory.groupType)) ? 1 : null;
  if (tripFacts.travelers) {
    push({ id: "travellers", label: "Travellers", value: `${tripFacts.travelers}`, certainty: "confirmed", tripField: "travelers" });
  } else if (impliedSoloCount) {
    push({ id: "travellers", label: "Travellers", value: "1 (solo)", certainty: "confirmed", tripField: "travelers" });
  } else {
    // A headcount only ever guessed at (a booking for N, never "there are N of us") — surfaced
    // as a suggestion to confirm rather than saved outright, same as any other inferred fact.
    const s = suggestionFor("travelers");
    if (s) push({ id: "travellers", label: "Travellers", value: s.display, certainty: "suggested", suggestionKey: "travelers", note: s.rationale });
    else push({ id: "travellers", label: "Travellers", value: "", certainty: "undecided", tripField: "travelers" });
  }

  // A field that may be confirmed (from memory / a decision) OR carry a live suggestion.
  const softField = (id: string, label: string, confirmedValue: string, sKey: SuggestionKey, editKey?: PrefKey) => {
    if (confirmedValue) {
      push({ id, label, value: confirmedValue, certainty: "confirmed", editKey });
      return;
    }
    const s = suggestionFor(sKey);
    if (s) {
      push({ id, label, value: s.display, certainty: "suggested", suggestionKey: sKey, note: s.rationale });
      return;
    }
    push({ id, label, value: "", certainty: "undecided", editKey });
  };

  // Dates: the real trip range if set, else a live suggestion, else open. Editable inline.
  const dateRange = dateRangeText(tripDates);
  if (dateRange) {
    push({ id: "dates", label: "Dates", value: dateRange, certainty: "confirmed", editable: true });
  } else {
    const s = suggestionFor("dates");
    if (s) push({ id: "dates", label: "Dates", value: s.display, certainty: "suggested", suggestionKey: "dates", note: s.rationale, editable: true });
    else push({ id: "dates", label: "Dates", value: "", certainty: "undecided", editable: true });
  }

  softField("occasion", "Occasion", csv(memory.occasion), "occasion", "occasion");
  // A bare "80" said nothing about what it was per, or in what money (one answer read it as a nightly room rate, another as a
  // daily dorm bed): a plain number is a per-day budget, so say so, and in which currency when the trip has one.
  const budgetText = csv(memory.budget);
  if (/^\d+(?:[.,]\d+)?$/.test(budgetText.trim())) {
    push({ id: "budget", label: "Budget", value: formatMoney(Number(budgetText.replace(",", ".")), resolveCurrency(memory)), certainty: "confirmed", editKey: "budget", note: "per person, a day" });
  } else {
    softField("budget", "Budget", budgetText, "budget", "budget");
  }
  softField("group", "Kind of group", csv(memory.groupType), "group", "groupType");
  softField("pace", "Pace", csv(memory.pace), "pace", "pace");
  softField("interests", "Interests", csv(memory.interests) || csv(memory.likes), "interests", "interests");
  softField(
    "base_area",
    "Base neighbourhood",
    (() => {
      const d = decisions.find((x) => x.kind === "stay_area");
      return d ? decisionSummary("stay_area", d.value) : "";
    })(),
    "base_area",
  );
  softField(
    "getting_around",
    "Getting around",
    csv(memory.transport) ||
      (() => {
        const d = decisions.find((x) => x.kind === "transport");
        return d ? decisionSummary("transport", d.value) : "";
      })(),
    "getting_around",
    "transport",
  );
  softField("arrival", "Arrival", csv(memory.arrival), "arrival", "arrival");

  push({ id: "dislikes", label: "Avoid", value: csv(memory.dislikes), certainty: csv(memory.dislikes) ? "confirmed" : "undecided", editKey: "dislikes" });
  softField("dietary", "Dietary", csv(memory.dietaryNeeds), "dietary", "dietaryNeeds");
  push({
    id: "stay",
    label: "Where you're staying",
    value: lockedStay ? `${lockedStay.hotelName} · ${lockedStay.roomName}` : "",
    certainty: lockedStay ? "confirmed" : "undecided",
  });
  for (const d of realDecisions) {
    push({ id: `dec-${d.id}`, label: d.kind.replaceAll("_", " "), value: decisionSummary(d.kind, d.value), certainty: certaintyFor(d.source) });
  }
  return rows;
}

/** Rows that take a whole line of the grid rather than half of one. */
export const isWideRow = (row: Row): boolean =>
  ["destination", "dates", "base_area", "stay"].includes(row.id) || row.id.startsWith("dec-") || row.value.length > 20;

/** The panel's three groups, and the one half-width tile that would otherwise sit beside a hole (an odd number of them): it spans the row. */
export function groupRows(rows: Row[], isEditing: (row: Row) => boolean) {
  const confirmed = rows.filter((r) => r.certainty === "confirmed");
  const suggested = rows.filter((r) => r.certainty === "suggested");
  const undecided = rows.filter((r) => r.certainty === "undecided");
  const narrow = confirmed.filter((r) => !isWideRow(r) && !isEditing(r));
  const loneTile = narrow.length % 2 === 1 ? narrow[narrow.length - 1] : null;
  return { confirmed, suggested, undecided, loneTile };
}
