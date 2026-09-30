import { z } from "zod";
import { tripDurationDays, type Trip } from "@/features/trip/domain/trip";

/** `buildTripRowUpdate` only reads name/start_date/end_date — callers needn't supply a full `Trip` row (with an `id`). */
type CurrentTrip = Partial<Trip>;

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const proposedTripUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(160).optional(),
  origin: z.string().trim().max(160).nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  durationDays: z.number().int().min(1).max(365).nullable().optional(),
  travelerCount: z.number().int().min(1).max(100).nullable().optional(),
}).nullable().catch(null).default(null);

export type ProposedTripUpdate = NonNullable<z.infer<typeof proposedTripUpdateSchema>>;

const EXPLICIT_DESTINATION =
  /\b(?:i(?:'m| am)|we(?:'re| are))\s+(?:going|headed|travell?ing)\s+to\s+(?!stay\b|visit\b|see\b|eat\b|book\b)|\b(?:planning|plan)\b.{0,60}\btrip\s+to\b|\b(?:my|our|the)\s+(?:trip\s+)?destination\s+is\b|\bconfirm(?:ing)?\s+(?:the\s+)?destinati\w*\b/i;

export function withExplicitDestination(
  update: ProposedTripUpdate | null,
  message: string,
  locationFocus: string | null,
): ProposedTripUpdate | null {
  if (update?.destination || !locationFocus || !EXPLICIT_DESTINATION.test(message)) return update;
  return { ...(update ?? {}), destination: locationFocus };
}

/** The user actually asked to clear or reset something ("no dates yet", "forget the origin", "not sure"). */
const CLEAR_INTENT = /\b(?:clear|remove|reset|unset|forget|scrap|undecided|not sure|no idea|don'?t know|unknown|tbd|no (?:fixed |set )?dates?|flexible|start over|cancel)\b/i;

/**
 * A `null` in a proposed update means "clear this field". The resolver has emitted it for fields the
 * user never mentioned (a dates-only message wiped the saved traveller count), so a clear is only
 * honoured when the message itself asks for one. Setting a value, or clearing a field that is already
 * empty, is untouched.
 */
export function dropUnrequestedClears(current: CurrentTrip | null | undefined, update: ProposedTripUpdate, message: string): ProposedTripUpdate {
  if (CLEAR_INTENT.test(message)) return update;
  const held: Record<keyof ProposedTripUpdate, unknown> = {
    name: current?.name, destination: current?.destination, origin: current?.origin,
    startDate: current?.start_date, endDate: current?.end_date,
    durationDays: current?.duration_days, travelerCount: current?.travelers,
  };
  const kept = { ...update };
  for (const key of Object.keys(kept) as Array<keyof ProposedTripUpdate>) {
    if (kept[key] === null && held[key] != null) delete kept[key];
  }
  return kept;
}

function isRealIsoDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === value;
}

export function buildTripRowUpdate(current: CurrentTrip | null | undefined, tripUpdate: ProposedTripUpdate): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (tripUpdate.name !== undefined) update.name = tripUpdate.name;
  if (tripUpdate.destination !== undefined) {
    update.destination = tripUpdate.destination;
    if (tripUpdate.name === undefined && /^(?:Untitled trip|New trip ·)/i.test(current?.name ?? "")) {
      update.name = `${tripUpdate.destination.split(",")[0].trim()} trip`;
    }
  }
  if (tripUpdate.origin !== undefined) update.origin = tripUpdate.origin;
  if (tripUpdate.travelerCount !== undefined) update.travelers = tripUpdate.travelerCount;

  if (tripUpdate.startDate !== undefined || tripUpdate.endDate !== undefined) {
    const start = tripUpdate.startDate !== undefined ? tripUpdate.startDate : current?.start_date ?? null;
    const end = tripUpdate.endDate !== undefined ? tripUpdate.endDate : current?.end_date ?? null;
    if (start && !isRealIsoDate(start)) throw new Error("The trip start date is not a real calendar date");
    if (end && !isRealIsoDate(end)) throw new Error("The trip end date is not a real calendar date");
    if (start && end && end < start) throw new Error("The trip dates are out of order");
    update.start_date = start;
    update.end_date = end;
    update.duration_days = tripDurationDays(start, end);
  } else if (tripUpdate.durationDays !== undefined) {
    update.duration_days = tripUpdate.durationDays;
  }

  return update;
}
