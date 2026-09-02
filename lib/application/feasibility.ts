// ponytail: a flat heuristic, not real routing math. A "stop" bundles the
// visit plus its travel, queue and ticket time. Refine with provider durations
// and per-day travel-time matrices in a later hardening pass.
export function dayCapacity(pace?: string): number {
  const value = (pace ?? "").toLowerCase();
  if (value.includes("relax")) return 3;
  if (value.includes("pack")) return 6;
  return 4;
}

/** One-line nudge for the COMPOSE prompt when the plan already looks dense. */
export function feasibilityHint(pace: string | undefined, itineraryDayIndexes: number[]): string {
  const capacity = dayCapacity(pace);
  const perDay = new Map<number, number>();
  for (const day of itineraryDayIndexes) perDay.set(day, (perDay.get(day) ?? 0) + 1);
  const overloaded = [...perDay.entries()].filter(([, count]) => count > capacity).map(([day]) => day + 1);
  const base = `The traveller's pace is ${pace || "unspecified"}; a realistic day is about ${capacity} stops once travel, queues and meals are counted.`;
  return overloaded.length
    ? `${base} Day${overloaded.length > 1 ? "s" : ""} ${overloaded.join(", ")} already exceed that — say so and offer to trim or split.`
    : `${base} Flag any day you would push past that.`;
}
