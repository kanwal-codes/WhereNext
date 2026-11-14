/**
 * What kind of answer a message calls for, read from its wording alone (no model call). The two shapes that
 * the written reply has to get right and that the cards must not stand in for: a request for the whole
 * picture, and a message from someone who is stuck right now.
 */

/** "Tell me everything…", "the full story of…", "explain how…": the reader wants paragraphs, so a card or a one-line stand-in is not the answer. */
const DEPTH = /\b((tell|show|give) me everything|everything (i|we|you) (should|need|must|have to|ought to) (know|do|see)|everything about|in detail|detailed|full story|whole story|the story of|in depth|deep dive|walk me through|tell me (all )?about|explain|what should i know|all i need to know|history of|how does\b.*\bwork)\b/i;
export const asksForDepth = (message: string) => DEPTH.test(message);

/** Someone stuck or stressed right now: lost, stranded, missed or cancelled transport, robbed, sick, locked out, out of battery or money. */
const URGENT = [
  /\b(i'?m|im|we'?re|were|we are|i am)\s+(so\s+)?(lost|stranded|stuck|robbed|scammed|sick|ill|locked out|hurt|injured)\b/i,
  /\bmissed\s+(my|our|the)\s+(flight|train|bus|ferry|connection)\b/i,
  /\b(flight|train|bus|ferry)\s+(was\s+|got\s+|is\s+|has been\s+)?(cancel+ed|delayed)\b/i,
  /\b(lost|stolen|forgot|left)\s+(my|our|the)\s+(passport|wallet|phone|bag|luggage|cards?|keys?)\b/i,
  /\b(phone|battery)\b.{0,16}\b\d{1,2}\s?%/i,
  /\b(stomach ache|food poisoning|fever|bleeding|chest pain|can'?t breathe|ambulance|hospital|emergency|doctor|pharmacy)\b/i,
  /\b(help)!{2,}|\b(urgent|asap|right now)\b.*[!?]/i,
];
export const isUrgent = (message: string) => URGENT.some((pattern) => pattern.test(message));

/** Whether a message is about the weather or what to pack. An "essentials" question about a visa, a doctor or tipping is not, and must not
 *  be answered with a weather card and a packing checklist (the router sometimes files it under the same intent). */
const WEATHER_OR_PACKING = /\b(weather|forecast|rain\w*|snow\w*|storm|temperature|degrees|hot|cold|warm|chilly|humid|climate|season|sunny|sunscreen|pack\w*|bring|wear|umbrella|jacket|coat|luggage|suitcase|carry-on|need to (take|bring)|what to (take|bring|wear)|checklist)\b/i;
export const asksAboutWeatherOrPacking = (message: string) => WEATHER_OR_PACKING.test(message);
