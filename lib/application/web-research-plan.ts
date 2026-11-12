/**
 * How to ask the web search for one query. Tavily was only ever asked the plain way: five results from anywhere. Two things it does
 * well were left unused: reading only travel authorities (a guide to where to stay or what a place is known for beats a booking site's
 * blog), and writing a short answer from the results (a plain fact, like tap water or tipping, should reach the reply already settled).
 */
export const TRAVEL_AUTHORITIES = ["wikivoyage.org", "lonelyplanet.com", "timeout.com", "cntraveler.com", "roughguides.com", "atlasobscura.com"];

const GUIDE_QUERY = /\b(neighbou?rhoods?|where to stay|best areas?|areas? to stay|known for|famous for|travel guide|day trips?|best time to visit|things to do)\b/i;
const FACT_QUERY = /\b(tap water|drinkable|tipping|tip(?:s)?\b|voltage|plugs?|adapters?|emergency number|visa|currency|etiquette|dress code|sim card|esim|is it safe|safe to|tax[- ]free|vat)\b/i;

export type WebResearchPlan = { domains?: string[]; answer: boolean };

export function webResearchPlan(query: string): WebResearchPlan {
  return { ...(GUIDE_QUERY.test(query) ? { domains: TRAVEL_AUTHORITIES } : {}), answer: FACT_QUERY.test(query) };
}
