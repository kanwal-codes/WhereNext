// ponytail: flat US-average constants, no per-city fare calibration or surge modeling — there's
// no rideshare quoting API wired up. Swap for a real quote (e.g. RouteStack) if usage ever
// justifies the integration; until then this is clearly labeled as an estimate, not a price.
const BASE_FARE = 2.5;
const PER_KM = 1.1;
const PER_MINUTE = 0.25;

export type RideshareEstimate = { low: number; high: number; currency: string; minutes: number };

/** A rough cost/time range for a rideshare covering the same distance as a driving route. */
export function estimateRideshare(distanceMeters: number, durationSeconds: number, currency = "USD"): RideshareEstimate {
  const km = distanceMeters / 1000;
  const minutes = Math.round(durationSeconds / 60);
  const fare = BASE_FARE + PER_KM * km + PER_MINUTE * minutes;
  return { low: Math.round(fare * 0.85), high: Math.round(fare * 1.25), currency, minutes };
}
