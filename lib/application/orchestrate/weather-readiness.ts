import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import type { Evidence } from "@/lib/application/orchestrate/retrieve-plan";
import { daysUntilTrip } from "@/lib/trip-dates";

const WEATHER_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Whether this turn shows a weather card, and from what: a live forecast when the trip is close, else a "typical <month>" from the web notes. */
export function weatherReadiness(input: { intent: ResolvedTurn["intent"]; caps: Set<ResolvedTurn["capabilities"][number]>; tripStart: string | undefined; evidence: Evidence; sourceCount: number }) {
  const { intent, caps, tripStart, evidence, sourceCount } = input;
  const weatherMonth = (() => {
    if (typeof tripStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tripStart)) return null;
    const name = WEATHER_MONTHS[Number(tripStart.slice(5, 7)) - 1];
    const dom = Number(tripStart.slice(8, 10));
    return dom >= 21 ? `late ${name}` : dom <= 10 ? `early ${name}` : name;
  })();
  // A budget question can be mis-tagged "essentials"; don't also drag in a weather card / checklist.
  // Same for `structured_answer`: when RESOLVE already decided this essentials-adjacent question
  // (language, SIM, documents, money — none of them weather-related) deserves its own tailored
  // answer instead of the generic packing checklist, forcing a weather card in alongside it is
  // exactly as wrong as forcing in the checklist would be — live-caught: "do i need to learn any
  // language" got intent essentials + a correct structured_answer about French/English, plus an
  // entirely irrelevant "13°/5°, bring layers" weather card bolted on. The checklist-suppression
  // two lines below already excludes `structured_answer` for the same reason; this now matches it.
  const weatherIntent = (intent === "weather" || intent === "essentials") && !caps.has("budget") && !caps.has("structured_answer");
  // A live forecast only means something if the trip is within its reach (or under way).
  const daysToTrip = typeof tripStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tripStart) ? daysUntilTrip(tripStart) : null;
  const tripInForecastWindow = daysToTrip !== null && daysToTrip <= 6 && daysToTrip >= -21;
  const forecastReady = tripInForecastWindow && (evidence.weatherDays?.length ?? 0) > 0;
  const seasonalReady = !forecastReady && Boolean(weatherMonth && sourceCount > 0);
  const willShowWeatherCard = weatherIntent && (forecastReady || seasonalReady);
  return { weatherMonth, forecastReady, willShowWeatherCard };
}
