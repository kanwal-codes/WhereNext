import type { ResolvedTurn } from "@/lib/application/turn-resolver";
import { replyText } from "@/lib/application/orchestrate/thread-history";

/** The traveller asked for a round trip, so a return day is part of the search. */
const ROUND_TRIP = /\b(?:return(?:ing)?|round[\s-]?trip|and back|come back|coming back|fly back|there and back)\b/i;
/** The last reply already asked about dates: a second ask would be the same question again. */
const ASKED_DATES = /\b(?:dates?|check-?\s?in|check-?\s?out|what day|which day|when|fly back|leave|depart\w*)\b/i;

const CHIPS = ["This weekend", "Next weekend", "I'm flexible"];

/**
 * Flights and stays are priced for particular days, so a search with no day is a search for a made-up one: it shows prices for an
 * example date, then runs again once the traveller gives the real one. This asks first, once, and searches when the answer arrives.
 *
 * Nothing is asked when a date is already known (in the message, the conversation, or the trip: planRetrieval fills the trip's own dates
 * into the search), when the last reply already asked, or when the traveller dodged ("flexible", "just show me"): that falls through to
 * the example-date search, which the cards label. The question is written here in English only; for any other language the router asks
 * in the traveller's own words (see its prompt) and this stays out of the way.
 */
export function missingDatesQuestion(input: {
  resolved: ResolvedTurn;
  prompt: string;
  /** Roam's last reply in this thread, if any. */
  previousReply?: string;
  tripStart?: string | null;
  tripEnd?: string | null;
}): { question: string; chips: string[] } | null {
  const { resolved, prompt, previousReply = "", tripStart, tripEnd } = input;
  if (resolved.outOfScope || resolved.clarify || !resolved.language.toLowerCase().startsWith("en")) return null;
  const previous = replyText(previousReply);
  if (previous.endsWith("?") && ASKED_DATES.test(previous)) return null;

  const flights = resolved.toolPlan.flatMap((call) => (call.tool === "flights" ? [call] : []));
  // A named hotel is a question about one already shown, which carries its own dates.
  const stays = resolved.toolPlan.flatMap((call) => (call.tool === "stays" && !call.hotelName ? [call] : []));
  const needsDeparture = flights.some((call) => !call.departureDate && !tripStart);
  const needsStayDates = stays.some((call) => !call.checkin && !tripStart);
  const needsReturn = !needsDeparture && ROUND_TRIP.test(prompt) && flights.some((call) => !call.returnDate && !tripEnd);

  if (needsDeparture && needsStayDates) return { question: "What dates are you travelling?", chips: CHIPS };
  if (needsDeparture) return { question: ROUND_TRIP.test(prompt) ? "What are your departure and return dates?" : "What day do you want to fly?", chips: CHIPS };
  if (needsStayDates) return { question: "What are your check-in and check-out dates?", chips: CHIPS };
  if (needsReturn) return { question: "And when do you want to fly back?", chips: ["A week later", "I'm flexible"] };
  return null;
}
