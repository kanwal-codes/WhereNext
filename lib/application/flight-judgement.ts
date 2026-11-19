import type { FlightLeg, FlightOffer } from "@/packages/providers/duffel/client";
import type { FlightSearch } from "@/lib/application/retrieve";

/**
 * What a traveller weighs when they ask "is it worth it?", worked out here from the offers so the model explains
 * facts instead of rediscovering them: where each layover is and how long, which flights are risky, and what the
 * cheapest option really costs in time. Thresholds are rules of thumb: the decision evals (EVAL_SET=decisions) are
 * where they get tuned.
 */
export const LONG_LAYOVER_MIN = 6 * 60;
export const SHORT_CONNECTION_MIN = 90;
/** A saving under this share of the fastest fare is not worth extra hours in the air. */
export const TINY_SAVING_PCT = 5;
/** Extra travel time under this is "not slower". */
const SAME_TIME_H = 0.25;

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const money = (amount: number, currency: string) => `${Math.round(amount).toLocaleString("en-US")} ${currency}`;

function layoverNotes(legs: FlightLeg[] | undefined, prefix: string) {
  const notes: string[] = [];
  const flags: string[] = [];
  for (const leg of legs ?? []) {
    if (leg.oftenDelayed) flags.push(`${prefix}${leg.airline ?? "a flight"} ${leg.flightNumber ?? ""} is often delayed over 30 min`.replace(/\s+/g, " "));
    if (!leg.layoverMinutes || leg.layoverMinutes <= 0) continue;
    const where = leg.toName ? `${leg.toName} (${leg.to})` : leg.to;
    notes.push(`${prefix}${hours(leg.layoverMinutes)} h at ${where}${leg.overnight ? ", overnight" : ""}`);
    if (leg.overnight) flags.push(`${prefix}overnight layover at ${leg.to}`);
    else if (leg.layoverMinutes >= LONG_LAYOVER_MIN) flags.push(`${prefix}long layover (${hours(leg.layoverMinutes)} h at ${leg.to})`);
    if (leg.layoverMinutes < SHORT_CONNECTION_MIN) flags.push(`${prefix}tight connection (${leg.layoverMinutes} min at ${leg.to})`);
  }
  return { notes, flags };
}

export type JudgedOffer = { layovers: string[]; flags: string[] };

/** Per offer: its layovers and risk flags. For the search: plain sentences on cheapest vs fastest vs nonstop. */
export function judgeFlights(search: FlightSearch): { offers: JudgedOffer[]; read: string[] } {
  const offers: JudgedOffer[] = search.offers.map((offer) => {
    const out = layoverNotes(offer.legs, "");
    const back = layoverNotes(offer.returnLegs, "return: ");
    return { layovers: [...out.notes, ...back.notes], flags: [...out.flags, ...back.flags] };
  });

  const priced = search.offers
    .map((offer, index) => ({ offer, index, price: Number(offer.priceAmount) }))
    .filter((o) => Number.isFinite(o.price) && o.price > 0 && o.offer.durationMinutes > 0);
  const read: string[] = [];
  if (priced.length === 0) return { offers, read };

  const currency = priced[0].offer.priceCurrency;
  const label = (o: { offer: FlightOffer }) => `${o.offer.airline} ${o.offer.stops === 0 ? "nonstop" : `${o.offer.stops} stop${o.offer.stops === 1 ? "" : "s"}`}, ${hours(o.offer.durationMinutes)} h`;
  const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
  const fastest = priced.reduce((a, b) => (b.offer.durationMinutes < a.offer.durationMinutes ? b : a));
  read.push(search.returnDate ? "Each fare is a round-trip total; the hours are the outbound flight." : "Each fare is one way.");

  if (cheapest.index === fastest.index) {
    read.push(`${label(cheapest)} is both the cheapest and the fastest.`);
  } else {
    const saves = fastest.price - cheapest.price;
    const extra = hours(cheapest.offer.durationMinutes - fastest.offer.durationMinutes);
    const pct = Math.round((saves / fastest.price) * 100);
    const verdict = extra <= SAME_TIME_H ? "and not slower"
      : pct < TINY_SAVING_PCT ? "a small saving for the extra time"
      : "a real saving, but slower";
    read.push(`Cheapest is ${label(cheapest)}; fastest is ${label(fastest)}. The cheapest saves ${money(saves, currency)} (${pct}%) and takes ${extra} h longer: ${verdict}.`);
    const risky = offers[cheapest.index].flags;
    if (risky.length) read.push(`Cheapest option flags: ${risky.join("; ")}.`);
  }

  // Nonstop against the cheapest, when they differ: what the convenience costs.
  const nonstop = priced.filter((o) => o.offer.stops === 0).reduce<typeof cheapest | null>((a, b) => (!a || b.price < a.price ? b : a), null);
  // (Skipped when the nonstop is the fastest option: the sentence above already says it.)
  if (nonstop && nonstop.index !== fastest.index && cheapest.offer.stops > 0 && nonstop.price > cheapest.price) {
    const premium = nonstop.price - cheapest.price;
    const shorter = hours(cheapest.offer.durationMinutes - nonstop.offer.durationMinutes);
    read.push(`The cheapest nonstop (${label(nonstop)}) costs ${money(premium, currency)} (${Math.round((premium / cheapest.price) * 100)}%) more than the cheapest option and saves ${shorter} h.`);
  }

  const ins = search.insights;
  if (ins) {
    const range = ins.typicalLow && ins.typicalHigh ? ` (typically ${money(ins.typicalLow, currency)} to ${money(ins.typicalHigh, currency)})` : "";
    read.push(`Google rates these prices ${ins.level} for this route${range}.`);
  }
  return { offers, read };
}
