import { z } from "zod";
import { runBulkBuilder } from "./bulk-builder";
import { categoryLabel, cityFrom, type GooglePlaceDetails } from "@/lib/places-ui";
import type { UsageEntry } from "@/lib/ai/pricing";

export type AboutSnippet = { title: string; url: string; content: string };
export type PlaceAbout = { content: string; source?: { title: string; url: string } };

/**
 * What a place page says about the place is written, not scraped. A web page's text is built for a search engine or a
 * menu board ("top of page ## NIGHT CLUB… IMG-2021.jpg"), and showing any of it as the page's own voice is how gibberish
 * reaches a traveller. So the model writes two plain sentences from the facts, or nothing is claimed beyond what Google
 * itself lists; and whatever comes back is checked before it is shown.
 */
const SYSTEM = `You write the short "About" blurb on a travel app's page for one place. Write for a traveller deciding whether to go.
You are given EVIDENCE: facts from the map listing, and rough text scraped from the web. The scraped text is messy: it can contain page chrome, headings, file names, menus, prices, cookie notices, other languages. Use only what is true of THIS place and say it in your own plain words.
Rules:
- Write in the language "{{LANG}}" (BCP-47). Translate anything foreign. Never paste scraped text, file names, headings, URLs, hashtags or opening hours.
- One or two sentences, 120 to 260 characters in total. Say what the place is and what it is like or known for. Warm, specific, calm: no hype, no "must-visit", no exclamation marks, no "hidden gem".
- Never invent a fact. If the evidence does not say what it is like, write one plain sentence from the category and the area instead.
- Return JSON only: {"about": "<the blurb>", "source": <the index of the web snippet you relied on, or null>}`;

const schema = z.object({ about: z.string().trim().max(500), source: z.number().int().min(0).max(8).nullable().optional() });

/** Fit to show: real sentences of a sensible length, with nothing that betrays a scrape. */
export function isPolishedAbout(text: string): boolean {
  const t = text.trim();
  if (t.length < 40 || t.length > 340) return false;
  if (/(^|\s)#{1,6}\s|top of page|\.(jpe?g|png|webp|gif|pdf)\b|https?:\/\/|www\.|\{|\}|<[a-z/]|\[\.\.\.\]|[-�]|cookie|click here|lorem ipsum/i.test(t)) return false;
  if (!/^\p{Lu}/u.test(t) || !/[.!?]$/.test(t)) return false;
  if ((t.match(/\p{L}/gu)?.length ?? 0) / t.length < 0.7) return false; // mostly words, not symbols and digits
  if (t.split(/\s+/).length < 7) return false;
  if (/(\b[A-ZÀ-Ý]{3,}\b\s+){3,}/.test(t)) return false; // a run of shouted words is a sign, not a sentence
  return true;
}

/** Only what the listing itself states, in a fixed shape: the fallback that can never read badly. */
export function plainAbout(place: GooglePlaceDetails): string | null {
  const kind = place.primaryType ? categoryLabel(place.primaryType).toLowerCase() : null;
  if (!kind || kind === "place") return null;
  const where = cityFrom(place.formattedAddress);
  const article = /^[aeiou]/.test(kind) ? "An" : "A";
  const lead = `${article} ${kind}${where ? ` in ${where}` : ""}`;
  const rated = place.rating && place.userRatingCount && place.userRatingCount >= 10
    ? `, rated ${place.rating.toFixed(1)} out of 5 from ${place.userRatingCount.toLocaleString("en")} reviews on Google`
    : "";
  return `${lead}${rated}.`;
}

type Review = { text?: { text?: string } | string };
const reviewTexts = (place: GooglePlaceDetails): string[] =>
  ((place.reviews ?? []) as Review[])
    .map((r) => (typeof r.text === "string" ? r.text : r.text?.text) ?? "")
    .filter((t) => t.length > 40)
    .slice(0, 3)
    .map((t) => t.replace(/\s+/g, " ").slice(0, 260));

/** The blurb for a place, or null when there is honestly nothing good to say. */
export async function writePlaceAbout(input: {
  place: GooglePlaceDetails;
  snippets: AboutSnippet[];
  language?: string;
  signal?: AbortSignal;
  onUsage?: (entry: UsageEntry) => void;
}): Promise<PlaceAbout | null> {
  const { place, snippets } = input;
  const name = place.displayName?.text;
  if (!name) return null;

  const facts = [
    `Name: ${name}`,
    place.primaryType ? `Category: ${categoryLabel(place.primaryType)}` : null,
    place.types?.length ? `Also listed as: ${place.types.filter((t) => !/^(point_of_interest|establishment)$/.test(t)).slice(0, 6).map(categoryLabel).join(", ")}` : null,
    place.formattedAddress ? `Address: ${place.formattedAddress}` : null,
    place.rating ? `Rating: ${place.rating} from ${place.userRatingCount ?? "few"} reviews` : null,
    place.editorialSummary?.text ? `Map listing summary: ${place.editorialSummary.text}` : null,
    ...reviewTexts(place).map((t, i) => `Visitor review ${i + 1}: ${t}`),
  ].filter(Boolean);
  const web = snippets.slice(0, 3).map((s, i) => `[${i}] ${s.title}\n${s.content.replace(/\s+/g, " ").slice(0, 700)}`);

  const parsed = await runBulkBuilder(
    SYSTEM.replace("{{LANG}}", input.language ?? "en"),
    `EVIDENCE\n${facts.join("\n")}\n\nWEB SNIPPETS (messy)\n${web.length ? web.join("\n\n") : "(none)"}`,
    schema,
    input.signal,
    input.onUsage,
  );
  if (parsed && isPolishedAbout(parsed.about)) {
    const hit = parsed.source != null ? snippets[parsed.source] : undefined;
    return { content: parsed.about.trim(), ...(hit ? { source: { title: hit.title, url: hit.url } } : {}) };
  }
  const plain = plainAbout(place);
  return plain ? { content: plain } : null;
}
