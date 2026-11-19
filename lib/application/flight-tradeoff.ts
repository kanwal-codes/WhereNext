/** A saving under this share of the fastest fare is not worth extra hours in the air. */
const TINY_SAVING_PCT = 5;
/** Extra travel time under this is "not slower". */
const SAME_TIME_MIN = 15;

export type FareFacts = { price: number; minutes: number; stops: number };

export type Tradeoff = {
  /** Indexes into the fares given. */
  cheapest: number;
  fastest: number;
  /** One fare is both the cheapest and the fastest: there is no trade-off to make. */
  same: boolean;
  saves: number;
  savesPct: number;
  extraMinutes: number;
  verdict: "not slower" | "small saving" | "real saving";
  /** The fastest fare is a nonstop, so it can be named as "the nonstop". */
  fastestIsNonstop: boolean;
};

/** What the cheapest fare gives up in time against the fastest: the one comparison both the cards and the writer make. */
export function tradeoff(fares: FareFacts[]): Tradeoff | null {
  const usable = fares.map((fare, index) => ({ ...fare, index })).filter((fare) => Number.isFinite(fare.price) && fare.price > 0 && fare.minutes > 0);
  if (usable.length === 0) return null;
  const cheapest = usable.reduce((a, b) => (b.price < a.price ? b : a));
  const fastest = usable.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  const saves = fastest.price - cheapest.price;
  const extraMinutes = cheapest.minutes - fastest.minutes;
  const savesPct = Math.round((saves / fastest.price) * 100);
  const verdict = extraMinutes <= SAME_TIME_MIN ? "not slower" : savesPct < TINY_SAVING_PCT ? "small saving" : "real saving";
  return { cheapest: cheapest.index, fastest: fastest.index, same: cheapest.index === fastest.index, saves, savesPct, extraMinutes, verdict, fastestIsNonstop: fastest.stops === 0 };
}
