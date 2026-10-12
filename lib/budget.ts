import type { Reservation } from "@/packages/contracts/reservation";
import type { StayDecision } from "@/packages/contracts/stay";

/**
 * What the group has already committed, from bookings entered by hand (hotels, flights, trains,
 * tickets) plus a stay chosen in the app. Everything is the GROUP's total: a price entered per person is
 * multiplied by the people it covers (the booking's own count, else the trip's travellers, else 1).
 * Cancelled bookings are not committed. A stay chosen in the app is skipped when a hand-entered stay
 * already covers its nights, so one hotel is never counted twice.
 */
export type CommittedLine = { currency: string; total: number; count: number };

export const groupAmount = (r: Pick<Reservation, "amount" | "amountBasis" | "travellers">, tripTravellers: number | null): number | null => {
  if (r.amount == null) return null;
  return r.amountBasis === "per_person" ? r.amount * (r.travellers ?? tripTravellers ?? 1) : r.amount;
};

const overlaps = (aStart: string | null, aEnd: string | null, bStart: string, bEnd: string): boolean => !!aStart && aStart < bEnd && (aEnd ?? aStart) >= bStart;

export function committedSpend(reservations: Array<Pick<Reservation, "kind" | "startsOn" | "endsOn" | "status" | "amount" | "currency" | "amountBasis" | "travellers">>, stay: StayDecision | null, tripTravellers: number | null): CommittedLine[] {
  const totals = new Map<string, CommittedLine>();
  const add = (amount: number | null, currency: string | null) => {
    if (amount == null || !currency) return;
    const code = currency.toUpperCase();
    const line = totals.get(code) ?? { currency: code, total: 0, count: 0 };
    line.total += amount;
    line.count += 1;
    totals.set(code, line);
  };
  const live = reservations.filter((r) => r.status !== "cancelled");
  for (const r of live) add(groupAmount(r, tripTravellers), r.currency);
  if (stay && !live.some((r) => r.kind === "stay" && overlaps(r.startsOn, r.endsOn, stay.checkin, stay.checkout))) add(stay.totalAmount, stay.currency);
  return [...totals.values()];
}
