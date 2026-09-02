import { createAiGateway } from "@/packages/ai/gateway";
import { parsedTripSchema, type ParsedTrip } from "@/features/trip/domain/trip";

function system(today: string) {
  return `You turn a traveller's one-line trip description into structured fields for a "new trip" form.
Today's date is ${today}. Resolve every relative date against it.
Return ONLY a JSON object. Every key is optional:
  name, destination, origin, durationDays (integer), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD),
  travelerCount (integer), vibe, budget, pace, transportPreference, dietaryNeeds

Rules:
- Include a key ONLY when the text says or clearly implies it. Omit anything you would be guessing — do not fill in "moderate", "balanced", "public transit" or a home city as defaults.
- destination: a real city or region the traveller named. If they are only vague ("somewhere warm", "a beach"), OMIT it — never invent a place.
- name: ALWAYS produce one when you have a destination. A short, natural label that reflects the description — the destination plus the trip's company or character when the text implies one: "Montreal with friends", "Solo week in Kyoto", "Anniversary trip to Rome", "Family road trip, Italy". If nothing else stands out, use the destination alone ("Montreal"). NEVER a mechanical "<place>, <n> days".
- Dates:
    * startDate / endDate: only when the traveller gives an actual window. Resolve relative phrases against today: "next weekend" -> the coming Sat and Sun; "first week of June" -> Jun 1 to Jun 7; "Mar 14-20" -> the 14th to the 20th; "the 17th for 5 nights" -> the 17th and the 17th + 5 days. If a stated month has already passed this year, use next year. Never invent a year or a range the traveller did not give.
    * durationDays: the trip length in days when only a length is stated ("a long weekend" -> 3, "a week" -> 7). If you produced startDate AND endDate, you may omit durationDays.
- travelerCount: use the exact number written. Do NOT add one for the speaker — never do arithmetic. "with 3 friends" -> 3. "going with my 3 friends" -> 3. "3 of us" / "a group of 3" / "3 people" -> 3. "solo" / "just me" -> 1. "my partner and I" / "the two of us" -> 2. Only when they write a plain total ("the 4 of us", "4 travellers", "party of 4") use that number. Omit if no count is given.
- origin: only if they name where they leave FROM ("from Toronto", "out of JFK"). Never guess a home city.
- vibe / budget / pace / transportPreference / dietaryNeeds: short phrases in the traveller's own words, and only when those words are present ("relaxed, food-focused", "mid-range", "vegetarian", "trains only").
- No commentary, no markdown fences. Just the JSON object.`;
}

/** One structured model call: a free-text trip description -> form fields. Never throws for a bad parse; returns {} instead. */
export async function parseTripPrompt(prompt: string, signal?: AbortSignal): Promise<ParsedTrip> {
  try {
    const raw = await createAiGateway({ model: process.env.RESOLVE_MODEL || undefined }).generateStructured(
      [
        { role: "system", content: system(new Date().toISOString().slice(0, 10)) },
        { role: "user", content: prompt.slice(0, 600) },
      ],
      signal,
    );
    return parsedTripSchema.parse(raw);
  } catch {
    return {};
  }
}
