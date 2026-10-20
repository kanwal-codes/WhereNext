/** When a journey should leave or arrive: a day and a clock time, both as they read at the place it starts. */
export type When = { kind: "depart" | "arrive"; date: string; time: string };

const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (d: Date) => ({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
const fromWhen = (w: Pick<When, "date" | "time">) => new Date(`${w.date}T${w.time}:00`);

/** Today as the date input wants it. */
export const todayLocal = (now = new Date()) => toLocal(now).date;

/** Move a time earlier or later; from "now" (rounded up to the next quarter hour) when none is set. Days roll over. */
export function shiftWhen(when: When | null, minutes: number, now = new Date()): When {
  const base = when ? fromWhen(when) : new Date(Math.ceil(now.getTime() / 900_000) * 900_000);
  const next = new Date(base.getTime() + minutes * 60_000);
  return { kind: when?.kind ?? "depart", ...toLocal(next) };
}

/** "Mon, Oct 6 · 9:00 AM" */
function formatWhen(when: Pick<When, "date" | "time">, locale?: string): string {
  const d = fromWhen(when);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
}

/** The label on the "when" chip. */
export const whenLabel = (when: When | null, locale?: string) => (when ? `${when.kind === "depart" ? "Leave" : "Arrive by"} ${formatWhen(when, locale)}` : "Leave now");

/** Mapbox's local-time form for leaving at a time ("2026-10-06T09:00"); only a departure can be planned that way. */
export const departAtParam = (when: When | null) => (when?.kind === "depart" ? `${when.date}T${when.time}` : undefined);

export type Sort = "best" | "cheapest" | "fastest" | "earliest";
type Offer = { priceAmount: string; durationMinutes: number; stops: number; departAt: string; arriveAt: string };

/** A flight fits the time asked for: it leaves at or after it, or lands by it. Times are naive local ones ("2026-11-16T11:36:00"). */
export function fitsTime(offer: Pick<Offer, "departAt" | "arriveAt">, when: When | null): boolean {
  if (!when) return true;
  const wanted = `${when.date}T${when.time}`;
  return when.kind === "depart" ? offer.departAt.slice(0, 16) >= wanted : offer.arriveAt.slice(0, 16) <= wanted;
}

/** Flights as the traveller wants to see them: non-stop only when asked, in the order asked. "Best" keeps the provider's own order. */
export function arrangeFlights<T extends Offer>(offers: T[], sort: Sort, nonstopOnly: boolean): T[] {
  const kept = nonstopOnly ? offers.filter((o) => o.stops === 0) : [...offers];
  const by: Record<Exclude<Sort, "best">, (o: T) => number | string> = {
    cheapest: (o) => Number(o.priceAmount),
    fastest: (o) => o.durationMinutes,
    earliest: (o) => o.departAt,
  };
  if (sort === "best") return kept;
  const key = by[sort];
  return kept.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
