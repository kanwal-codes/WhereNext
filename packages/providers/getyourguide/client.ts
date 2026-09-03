import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

export type Activity = { title: string; url: string; date?: string; venue?: string; content: string; provider: "getyourguide" };

const API = "https://api.getyourguide.com";

// The tour object varies by account config; parse loosely and tolerate missing fields.
const tourSchema = z.object({
  tour_id: z.union([z.string(), z.number()]).optional(),
  title: z.string().optional(),
  abstract: z.string().optional(),
  url: z.string().optional(),
  overall_rating: z.number().optional(),
  number_of_ratings: z.number().optional(),
  price: z.object({ values: z.object({ amount: z.union([z.string(), z.number()]).optional(), currency: z.string().optional() }).optional() }).optional(),
  durations: z.object({ duration: z.union([z.string(), z.number()]).optional() }).partial().optional(),
  coordinates: z.object({ lat: z.number().optional(), long: z.number().optional() }).optional(),
}).passthrough();

const responseSchema = z.object({
  data: z.object({ tours: z.array(tourSchema).default([]) }).optional(),
}).passthrough();

/**
 * Bookable tours & activities from GetYourGuide's Partner API. Requires an
 * approved partner token (`GETYOURGUIDE_API_KEY`, sent as `X-ACCESS-TOKEN`).
 * ponytail: rides the assistant's "events" channel — give tours their own tool
 * + card if it earns it.
 */
export async function activities(query: string, currency: string, signal?: AbortSignal): Promise<Activity[]> {
  const token = process.env.GETYOURGUIDE_API_KEY;
  if (!token) throw new Error("GETYOURGUIDE_API_KEY is not configured");

  const qs = new URLSearchParams({ cnt_language: "en", currency: currency || "USD", limit: "8" });
  if (query) qs.set("q", query.slice(0, 120));

  const response = await guardedFetch("getyourguide", `${API}/1/tours?${qs}`, {
    headers: { "x-access-token": token, accept: "application/json" },
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`GetYourGuide search failed: ${response.status}`);

  const tours = responseSchema.parse(await response.json()).data?.tours ?? [];
  return tours.flatMap((tour) => {
    if (!tour.title || !tour.url) return [];
    const price = tour.price?.values;
    const priceLabel = price?.amount ? `from ${price.amount} ${price.currency ?? currency}` : undefined;
    const rating = typeof tour.overall_rating === "number" ? `${tour.overall_rating.toFixed(1)}★` : undefined;
    return [{
      title: tour.title,
      url: tour.url,
      venue: tour.abstract?.slice(0, 140) || undefined,
      content: [priceLabel, rating].filter(Boolean).join(" · "),
      provider: "getyourguide" as const,
    }];
  });
}
