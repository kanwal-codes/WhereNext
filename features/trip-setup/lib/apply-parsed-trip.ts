import type { ParsedTrip } from "@/features/trip/domain/trip";

export type ParsedTripFormState = {
  name: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  durationDays: string;
  useLength: boolean;
  travelerCount: string;
  vibe: string;
  budget: string;
  pace: string;
  transportPreference: string;
  dietaryNeeds: string;
};

/** Merge parser output into the controlled new-trip form without losing existing values. */
export function applyParsedTrip(current: ParsedTripFormState, parsed: Partial<ParsedTrip>): ParsedTripFormState {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const number = (value: unknown) => {
    const result = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isFinite(result) && result > 0 ? String(result) : undefined;
  };
  const date = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
  const destination = text(parsed.destination);
  const startDate = date(parsed.startDate);
  const endDate = date(parsed.endDate);
  const durationDays = number(parsed.durationDays);

  return {
    ...current,
    name: text(parsed.name) ?? destination ?? current.name,
    destination: destination ?? current.destination,
    origin: text(parsed.origin) ?? current.origin,
    startDate: startDate && endDate ? startDate : current.startDate,
    endDate: startDate && endDate ? endDate : current.endDate,
    durationDays: durationDays ?? current.durationDays,
    useLength: Boolean(durationDays && !(startDate && endDate)) ? true : startDate && endDate ? false : current.useLength,
    travelerCount: number(parsed.travelerCount) ?? current.travelerCount,
    vibe: text(parsed.vibe) ?? current.vibe,
    budget: text(parsed.budget) ?? current.budget,
    pace: text(parsed.pace) ?? current.pace,
    transportPreference: text(parsed.transportPreference) ?? current.transportPreference,
    dietaryNeeds: text(parsed.dietaryNeeds) ?? current.dietaryNeeds,
  };
}
