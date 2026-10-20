import type { ReservationDraft } from "@/lib/reservation-draft";
import type { Reservation } from "@/packages/contracts/reservation";

export type Draft = ReservationDraft;

export const blankDraft = (currency: string, startsOn: string): Draft => ({ kind: "activity", title: "", startsOn, endsOn: "", startTime: "", endTime: "", place: "", toPlace: "", confirmationCode: "", amount: "", currency, amountBasis: "total", travellers: "", status: "confirmed", notes: "" });
export const draftFromReservation = (r: Reservation, currency: string): Draft => ({
  kind: r.kind,
  title: r.title,
  startsOn: r.startsOn ?? "",
  endsOn: r.endsOn ?? "",
  startTime: r.startTime ?? "",
  endTime: r.endTime ?? "",
  place: r.place ?? "",
  toPlace: r.toPlace ?? "",
  confirmationCode: r.confirmationCode ?? "",
  amount: r.amount == null ? "" : String(r.amount),
  currency: r.currency ?? currency,
  amountBasis: r.amountBasis,
  travellers: r.travellers == null ? "" : String(r.travellers),
  status: r.status,
  notes: r.notes ?? "",
});

/** What is sent to save the booking: the form's fields, with price and people as numbers (null when left empty). */
export const reservationBody = (draft: Draft) => ({ ...draft, amount: draft.amount === "" ? null : Number(draft.amount), travellers: draft.travellers === "" ? null : Number(draft.travellers) });

/** Text with no booking in it comes back as an empty draft. */
export const isEmptyDraft = (found: Pick<ReservationDraft, "title" | "startsOn" | "confirmationCode" | "amount">) => !found.title && !found.startsOn && !found.confirmationCode && !found.amount;

/** The form with what a confirmation said filled in: only what it actually said; whatever is already typed stays for the rest. */
export const mergeFound = (current: Draft, found: Draft): Draft => ({ ...current, ...Object.fromEntries(Object.entries(found).filter(([, value]) => value !== "")) }) as Draft;
