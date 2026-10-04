import { z } from "zod";
import { runBulkBuilder } from "./bulk-builder";
import { isPolishedAbout } from "./place-about";
import type { StayDetails, StayNearbyPlace } from "@/packages/contracts/stay";
import type { UsageEntry } from "@/lib/ai/pricing";

/**
 * "The stay" blurb on a hotel page. A hotel listing's own description is marketing copy, often machine-spun
 * ("provides flawless service…visitors.Remain linked during your visit…"), and showing it as the page's voice is how
 * a strange paragraph reaches a traveller. So it is written from the facts the listing states, in plain words, and
 * checked like a place's About; when nothing good comes back, the facts alone are stated in a fixed, safe shape.
 */
const SYSTEM = `You write the short "The stay" blurb on a travel app's page for one hotel or rental. Write for a traveller deciding whether it suits them.
You are given FACTS from the listing, and the listing's own text, which is marketing copy and unreliable: it can be awkward, repetitive, run sentences together, or promise things in vague words. Use only what is plainly true of THIS property.
Rules:
- Write in the language "{{LANG}}" (BCP-47).
- Two sentences, 150 to 300 characters in total. First: what it is and where it sits. Second: what a guest can count on (a few concrete amenities, the guest rating, or a landmark within walking distance).
- Plain, warm and specific. No "flawless", "elevated", "unparalleled", "tranquil", "luxurious" or other brochure words, no exclamation marks, no lists of everything on offer.
- Never invent a fact. Never repeat the listing's wording; say it your own way.
- Return JSON only: {"about": "<the blurb>"}`;

const schema = z.object({ about: z.string().trim().max(500) });

type Facts = Pick<StayDetails, "name" | "stars" | "rating" | "reviewCount" | "city" | "address" | "facilities" | "description"> & { kind?: string | null; nearby?: StayNearbyPlace[] };

const walkMinutes = (n: StayNearbyPlace) => n.ways.find((w) => w.mode === "walk")?.minutes;

/** Only what the listing states, in a fixed shape: the fallback that can never read badly. */
export function plainStayAbout(f: Facts): string | null {
  const kind = (f.kind && !/^hotel$/i.test(f.kind) ? f.kind : "hotel").toLowerCase();
  const star = f.stars ? `${f.stars}-star ` : "";
  const lead = `A ${star}${kind}${f.city ? ` in ${f.city.split(",")[0]}` : ""}`.replace(/^A (?=[aeiou])/i, "An ");
  const rated = f.rating && f.reviewCount && f.reviewCount >= 10 ? `, rated ${f.rating.toFixed(1)} out of 10 by ${f.reviewCount.toLocaleString("en")} guests` : "";
  const near = f.nearby?.find((n) => (walkMinutes(n) ?? 99) <= 10);
  return `${lead}${rated}${near ? `, ${walkMinutes(near)} minutes on foot from ${near.name}` : ""}.`;
}

export async function writeStayAbout(input: { hotel: Facts; language?: string; signal?: AbortSignal; onUsage?: (entry: UsageEntry) => void }): Promise<string | null> {
  const f = input.hotel;
  const walkable = (f.nearby ?? []).filter((n) => (walkMinutes(n) ?? 99) <= 12).slice(0, 3).map((n) => `${n.name} (${walkMinutes(n)} min on foot)`);
  const facts = [
    `Name: ${f.name}`,
    f.kind ? `Type: ${f.kind}` : null,
    f.stars ? `Class: ${f.stars}-star` : null,
    f.city || f.address ? `Area: ${f.city ?? f.address}` : null,
    f.rating && f.reviewCount ? `Guest rating: ${f.rating.toFixed(1)} out of 10 from ${f.reviewCount} reviews` : null,
    f.facilities.length ? `Amenities: ${f.facilities.slice(0, 12).join(", ")}` : null,
    walkable.length ? `Within walking distance: ${walkable.join("; ")}` : null,
  ].filter(Boolean);
  const listing = (f.description ?? "").replace(/\s+/g, " ").slice(0, 900);

  const parsed = await runBulkBuilder(
    SYSTEM.replace("{{LANG}}", input.language ?? "en"),
    `FACTS\n${facts.join("\n")}\n\nLISTING TEXT (unreliable)\n${listing || "(none)"}`,
    schema,
    input.signal,
    input.onUsage,
  );
  if (parsed && isPolishedAbout(parsed.about)) return parsed.about.trim();
  return plainStayAbout(f);
}
