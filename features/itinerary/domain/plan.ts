import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import { clockLabel, isTransit, type DayBooking } from "@/lib/trip-reservations";
import type { Reservation } from "@/packages/contracts/reservation";
import type { ItineraryItem } from "./item";

/** Within a day: by the position the traveller gave it, then by when it was added. */
export const byOrder = (a: ItineraryItem, b: ItineraryItem) =>
  (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);

/** The calendar date for day N (1-based) given the trip's start date, or null when there's no start date. */
export function dayDate(startDate: string | null | undefined, dayN: number): string | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (dayN - 1));
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** The calendar date of a trip day (YYYY-MM-DD), or null when the trip has no start date. */
export const isoForDay = (startDate: string | null | undefined, d: number): string | null =>
  startDate ? new Date(Date.parse(`${startDate}T00:00:00Z`) + (d - 1) * 86_400_000).toISOString().slice(0, 10) : null;

/** The city a day is spent in, on a multi-city trip (null on a single-city one). */
export function cityOfDay(
  trip: { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null,
  startDate: string | null | undefined,
  d: number,
  bookedByDay: Map<number, DayBooking[]>,
): string | null {
  if (!trip) return null;
  const { stops } = effectiveStops(trip);
  if (stops.length < 2) return null;
  const iso = isoForDay(startDate, d);
  const here = stopForDate(stops, iso);
  const previous = here ? stops[stops.indexOf(here) - 1] : undefined;
  // The day a new city starts, with a flight or train leaving on it, is the move between the two, not a day spent in the new one.
  if (here && previous && here.startDate === iso && (bookedByDay.get(d) ?? []).some((b) => isTransit(b.reservation.kind) && b.note !== "Arrives")) return `${previous.city} → ${here.city}`;
  return here?.city ?? null;
}

/** Every day's items, each day in plan order. */
export function groupByDay(items: ItineraryItem[]): Map<number, ItineraryItem[]> {
  const map = new Map<number, ItineraryItem[]>();
  for (const item of items) {
    const list = map.get(item.day_index);
    if (list) list.push(item);
    else map.set(item.day_index, [item]);
  }
  for (const list of map.values()) list.sort(byOrder);
  return map;
}

/** The days to list: every day with a stop, every day with a booking, and each of the trip's planned days (up to 60). */
export function planDays(items: ItineraryItem[], bookedDays: Iterable<number>, plannedDays: number): number[] {
  return Array.from(new Set([...items.map((i) => i.day_index), ...bookedDays, ...Array.from({ length: Math.min(Math.max(plannedDays, 1), 60) }, (_, n) => n + 1)])).sort((a, b) => a - b);
}

/** Suggestions are ranked toward where the plan already is: the first stop that has a location, as [lng, lat]. */
export function planCentre(items: ItineraryItem[]): [number, number] | undefined {
  const at = items.find((i) => typeof i.metadata?.latitude === "number" && typeof i.metadata?.longitude === "number");
  return at ? [at.metadata!.longitude as number, at.metadata!.latitude as number] : undefined;
}

/** A stop added on the server: replaces the one with the same title (adding an existing place moves it), else joins the list. */
export function withAddedItem(list: ItineraryItem[], item: ItineraryItem): ItineraryItem[] {
  return list.some((i) => i.title === item.title) ? list.map((i) => (i.title === item.title ? item : i)) : [...list, item];
}

/** A day's stops in the order a traveller meets them: timed stops by the clock, then the untimed ones in the order added. */
export function chronological(dayItems: ItineraryItem[]): ItineraryItem[] {
  const timeOf = (i: ItineraryItem) => (typeof i.metadata?.time === "string" ? i.metadata.time : "");
  return dayItems.slice().sort((a, b) => (timeOf(a) || "99:99").localeCompare(timeOf(b) || "99:99"));
}

/** Which trip day "today" is (1-based), or null without a start date. */
export function todayDayNumber(startDate: string | null | undefined, today: Date): number | null {
  return startDate ? Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1 : null;
}

/** The weekday and date number a day shows in the phone's week strip ("Day" and its number when the trip has no dates). */
export function weekParts(startDate: string | null | undefined, d: number): { dow: string; num: string } {
  const iso = isoForDay(startDate, d);
  if (!iso) return { dow: "Day", num: String(d) };
  const date = new Date(`${iso}T00:00:00Z`);
  return { dow: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), num: String(date.getUTCDate()) };
}

export type OrderEntry = { title: string; dayIndex: number; position: number };
/** A change to the plan: what to send to the server, and how the list looks with it applied (shown at once, before the server answers). */
export type PlanChange = { order: OrderEntry[]; apply: (list: ItineraryItem[]) => ItineraryItem[] };

const orderOf = (touched: ItineraryItem[]): OrderEntry[] => touched.map((i) => ({ title: i.title, dayIndex: i.day_index, position: i.position ?? 0 }));
const applyTouched = (touched: ItineraryItem[]) => {
  const byTitle = new Map(touched.map((i) => [i.title, i]));
  return (list: ItineraryItem[]) => list.map((i) => byTitle.get(i.title) ?? i);
};

/** Move a stop to `toDay`, before `beforeTitle` (or at the end), renumbering the days it touches. Null when it is missing or locked. */
export function reorderChange(items: ItineraryItem[], movedTitle: string, toDay: number, beforeTitle: string | null): PlanChange | null {
  const moved = items.find((i) => i.title === movedTitle);
  if (!moved || moved.metadata?.locked === true) return null;
  const fromDay = moved.day_index;
  const rest = items.filter((i) => i.title !== movedTitle);
  const target = rest.filter((i) => i.day_index === toDay).sort(byOrder);
  const at = beforeTitle ? target.findIndex((i) => i.title === beforeTitle) : -1;
  target.splice(at < 0 ? target.length : at, 0, { ...moved, day_index: toDay });

  // The target day is already in its new order (the moved stop sits where it was dropped): number it as it stands. Sorting it again
  // by the stops' old positions would put the moved stop straight back where it came from. The day it left is just closed up.
  const intoTarget = target.map((i, idx) => ({ ...i, position: idx }));
  const outOfSource = fromDay !== toDay ? rest.filter((i) => i.day_index === fromDay).sort(byOrder).map((i, idx) => ({ ...i, position: idx })) : [];
  const touched = [...intoTarget, ...outOfSource];
  return { order: orderOf(touched), apply: applyTouched(touched) };
}

export type SwapResult =
  | { kind: "locked" }
  | { kind: "neighbour-locked" }
  | { kind: "edge" }
  | { kind: "ok"; change: PlanChange };

/** Swap a stop with the one before (-1) or after (+1) it in its day. `dayList` is that day's stops in plan order. */
export function swapWithinDay(dayList: ItineraryItem[], item: ItineraryItem, dir: -1 | 1): SwapResult {
  if (item.metadata?.locked) return { kind: "locked" };
  const list = dayList.slice();
  const idx = list.findIndex((i) => i.title === item.title);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return { kind: "edge" };
  if (list[swapIdx].metadata?.locked) return { kind: "neighbour-locked" };
  [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
  const renumbered = list.map((i, position) => ({ ...i, position }));
  return { kind: "ok", change: { order: orderOf(renumbered), apply: applyTouched(renumbered) } };
}

/** The day a stop lands on when moved a day earlier (-1) or later (+1); never before day 1. */
export const dayAfterMove = (item: ItineraryItem, dir: -1 | 1): number => Math.max(1, item.day_index + dir);

/** The list with one stop locked or unlocked. */
export const withLock = (list: ItineraryItem[], item: ItineraryItem, locked: boolean): ItineraryItem[] =>
  list.map((c) => (c.id === item.id ? { ...c, metadata: { ...(c.metadata ?? {}), locked } } : c));

/** The list with one stop's target time set ("HH:MM") or cleared (null). */
export const withTime = (list: ItineraryItem[], item: ItineraryItem, time: string | null): ItineraryItem[] =>
  list.map((c) => {
    if (c.id !== item.id) return c;
    const metadata = { ...(c.metadata ?? {}) };
    if (time === null) delete metadata.time;
    else metadata.time = time;
    return { ...c, metadata };
  });

/** The right-hand label of a booked row: the time, with "Departs" / "Arrives" / "Check-in" / "Check-out" when the booking spans days. */
export function bookedLabel(reservation: Reservation, note: string | null): string {
  const time = note === "Arrives" || note === "Check-out" ? reservation.endTime : reservation.startTime;
  if (note) return time ? `${note} ${clockLabel(time)}` : note;
  return time ? clockLabel(time) : "Booked";
}
