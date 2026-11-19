/**
 * What makes a connection risky, in one place: the cards say it (saffron lines on a row, flags on the journey) and the
 * writer's judgement (flight-judgement.ts) reads the same two numbers, so the words and the cards never disagree.
 */
export const TIGHT_CONNECTION_MIN = 45;
export const LONG_LAYOVER_MIN = 360;

/** "7h 05m", "10h", "45m": hours and minutes the way a traveller says them; a whole hour drops its zero minutes. */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const rest = total % 60;
  return rest ? `${Math.floor(total / 60)}h ${String(rest).padStart(2, "0")}m` : `${Math.floor(total / 60)}h`;
}

type LegLike = { layoverMinutes?: number; overnight?: boolean; oftenDelayed?: boolean };

/** The risk in the wait after this flight, as a flag ("Tight connection: 40 min"); null for an ordinary layover. */
export function layoverRisk(leg: LegLike): string | null {
  const minutes = leg.layoverMinutes;
  if (minutes === undefined || minutes <= 0) return null;
  if (leg.overnight) return `Overnight layover: ${formatDuration(minutes)}`;
  if (minutes < TIGHT_CONNECTION_MIN) return `Tight connection: ${minutes} min`;
  if (minutes >= LONG_LAYOVER_MIN) return `Long layover: ${formatDuration(minutes)}`;
  return null;
}

/** Every risk of a fare in the order a traveller meets it; a flight that is often late is named once. */
export function offerRisks(legs: LegLike[] | undefined): string[] {
  const risks = (legs ?? []).map(layoverRisk).filter((risk): risk is string => risk !== null);
  if ((legs ?? []).some((leg) => leg.oftenDelayed)) risks.push("Often over 30 min late");
  return risks;
}
