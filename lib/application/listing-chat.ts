import { z } from "zod";

/** The one thing (or the short list) a listing question is about, as the page shows it. Shared by the trip's side chat and the home page's, so both read a listing the same way. */
const listingItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  detail: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  rating: z.string().max(40).optional(),
  when: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  summary: z.string().max(700).optional(),
  hours: z.string().max(420).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type ListingItem = z.infer<typeof listingItemSchema>;

export const listingChatBodySchema = z.object({
  items: z.array(listingItemSchema).min(1).max(6),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
});

/** One line per item: its facts, and (in a trip) how far it is from where they are staying. */
export function listingLine(it: ListingItem, i: number, distance = ""): string {
  const bits = [it.detail, it.price && `price ${it.price}`, it.rating && `rating ${it.rating}`, it.when, it.address, it.summary && `about: ${it.summary}`, it.hours && `hours: ${it.hours}`].filter(Boolean);
  return `${i + 1}. ${it.name}${bits.length ? ` — ${bits.join("; ")}` : ""}${distance}`;
}

/**
 * The system prompt for a question about what is open on screen. With a trip, `fitsTrip` adds the "Fits your trip" part of the answer; without one
 * (the home page's Stays, Eat and Flights) the answer is about the listing alone and never claims anything about a trip.
 */
export function listingAnswerRules(single: boolean, fitsTrip: boolean): string {
  if (!single) return "Be concise and decisive: in 2–4 sentences say which you'd choose and why, judging fit against their budget, pace, what's already planned, and how convenient each is from where they're staying.";
  return [
    "Answer in this shape. First, one bolded sentence that answers the question directly: for \"is it worth it\" give a clear yes, maybe or not really, with the reason in a few words.",
    fitsTrip
      ? "Then at most three short bullets, each starting with a bold label, using only the ones the question needs and the facts support: **Best for** (who it suits, what to do there), **Plan around** (how long to allow, the best time, today's hours, anything that is closed or booked out), **Fits your trip** (the day it suits, which planned stops are near it and how far, how far it is from where they are staying)."
      : "Then at most two short bullets, each starting with a bold label, using only the ones the question needs and the facts support: **Best for** (who it suits, what to do there) and **Plan around** (how long to allow, the best time, today's hours, anything that is closed or booked out). No trip is open, so say nothing about their plans, budget or where they are staying.",
    "Keep the whole answer under about 90 words. Do not repeat the rating, review count or address the page already shows unless it changes the answer. No filler and no hedging paragraph; if something the question needs is missing, say so in one short clause. A planned stop with an obviously placeholder time (like 03:00) is worth one clause only when the question is about planning around it.",
  ].join(" ");
}
