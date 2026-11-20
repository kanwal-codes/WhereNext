import type { FlightLeg, FlightOffer } from "@/packages/providers/duffel/client";
import type { FlightSearch } from "@/lib/application/retrieve";
import { LONG_LAYOVER_MIN, TIGHT_CONNECTION_MIN } from "@/lib/application/flight-risks";
import { tradeoff } from "@/lib/application/flight-tradeoff";

/**
 * What a traveller weighs when they ask "is it worth it?", worked out here from the offers so the model explains
 * facts instead of rediscovering them: where each layover is and how long, which flights are risky, and what the
 * cheapest option really costs in time. The thresholds are the cards' own (flight-risks.ts), so the words and the
 * cards agree; the decision evals (EVAL_SET=decisions) are where they get tuned.
 */
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
    if (leg.layoverMinutes < TIGHT_CONNECTION_MIN) flags.push(`${prefix}tight connection (${leg.layoverMinutes} min at ${leg.to})`);
  }
  return { notes, flags };
}

export type JudgedOffer = { layovers: string[]; flags: string[] };

const VERDICT = { "not slower": "and not slower", "small saving": "a small saving for the extra time", "real saving": "a real saving, but slower" } as const;

/** Per offer: its layovers and risk flags. For the search: plain sentences on cheapest vs fastest vs nonstop. */
export function judgeFlights(search: FlightSearch): { offers: JudgedOffer[]; read: string[] } {
  const offers: JudgedOffer[] = search.offers.map((offer) => {
    const out = layoverNotes(offer.legs, "");
    const back = layoverNotes(offer.returnLegs, "return: ");
    return { layovers: [...out.notes, ...back.notes], flags: [...out.flags, ...back.flags] };
  });

  const t = tradeoff(search.offers.map((o) => ({ price: Number(o.priceAmount), minutes: o.durationMinutes, stops: o.stops })));
  const read: string[] = [];
  if (!t) return { offers, read };

  const cheapest = search.offers[t.cheapest];
  const fastest = search.offers[t.fastest];
  const currency = cheapest.priceCurrency;
  const label = (o: FlightOffer) => `${o.airline} ${o.stops === 0 ? "nonstop" : `${o.stops} stop${o.stops === 1 ? "" : "s"}`}, ${hours(o.durationMinutes)} h`;
  read.push(search.returnDate ? "Each fare is a round-trip total; the hours are the outbound flight." : "Each fare is one way.");

  if (t.same) {
    read.push(`${label(cheapest)} is both the cheapest and the fastest.`);
  } else {
    read.push(`Cheapest is ${label(cheapest)}; fastest is ${label(fastest)}. The cheapest saves ${money(t.saves, currency)} (${t.savesPct}%) and takes ${hours(t.extraMinutes)} h longer: ${VERDICT[t.verdict]}.`);
    const risky = offers[t.cheapest].flags;
    if (risky.length) read.push(`Cheapest option flags: ${risky.join("; ")}.`);
  }

  // Nonstop against the cheapest, when they differ: what the convenience costs.
  // (Skipped when the nonstop is the fastest option: the sentence above already says it.)
  const nonstop = search.offers
    .map((offer, index) => ({ offer, index, price: Number(offer.priceAmount) }))
    .filter((o) => o.offer.stops === 0 && Number.isFinite(o.price) && o.price > 0 && o.offer.durationMinutes > 0)
    .reduce<{ offer: FlightOffer; index: number; price: number } | null>((a, b) => (!a || b.price < a.price ? b : a), null);
  const cheapestPrice = Number(cheapest.priceAmount);
  if (nonstop && nonstop.index !== t.fastest && cheapest.stops > 0 && nonstop.price > cheapestPrice) {
    const premium = nonstop.price - cheapestPrice;
    const shorter = hours(cheapest.durationMinutes - nonstop.offer.durationMinutes);
    read.push(`The cheapest nonstop (${label(nonstop.offer)}) costs ${money(premium, currency)} (${Math.round((premium / cheapestPrice) * 100)}%) more than the cheapest option and saves ${shorter} h.`);
  }

  const ins = search.insights;
  if (ins) {
    const range = ins.typicalLow && ins.typicalHigh ? ` (typically ${money(ins.typicalLow, currency)} to ${money(ins.typicalHigh, currency)})` : "";
    read.push(`These prices are ${ins.level} for this route${range}.`);
  }
  return { offers, read };
}
