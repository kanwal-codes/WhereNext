import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";

export type LocalEvent = { title: string; url: string; content: string; date?: string; venue?: string; provider: "eventbrite" };

const nameField = z.union([z.string(), z.object({ text: z.string().optional() })]).optional();
const responseSchema = z.object({
  events: z.object({
    results: z.array(z.object({
      name: nameField,
      url: z.string().optional(),
      start_date: z.string().optional(),
      start: z.object({ local: z.string().optional() }).optional(),
      primary_venue: z.object({ name: z.string().optional() }).nullable().optional(),
    })).default([]),
  }).optional(),
});

const text = (value: unknown): string => (typeof value === "string" ? value : typeof (value as { text?: string })?.text === "string" ? (value as { text: string }).text : "");

/**
 * Local / community events near a point, via Eventbrite's destination search
 * (the documented public event search was retired; this endpoint powers their
 * site and works with a private token).
 */
export async function localEvents(query: string, latitude: number, longitude: number, signal?: AbortSignal): Promise<LocalEvent[]> {
  const token = process.env.EVENTBRITE_API_KEY;
  if (!token) throw new Error("EVENTBRITE_API_KEY is not configured");
  const response = await guardedFetch("eventbrite", "https://www.eventbriteapi.com/v3/destination/search/", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      event_search: {
        ...(query ? { q: query.slice(0, 100) } : {}),
        // This endpoint only takes date presets, not a range — pull a wider page and let the
        // caller filter to the trip window.
        dates: "current_future",
        dedup: true,
        page_size: 20,
        point_radius: { latitude, longitude, radius: "25km" },
      },
      "expand.destination_event": ["primary_venue"],
    }),
    signal: withProviderTimeout(signal),
  });
  if (!response.ok) throw new Error(`Eventbrite search failed: ${response.status}`);
  const results = responseSchema.parse(await response.json()).events?.results ?? [];
  return results.flatMap((event) => {
    const title = text(event.name);
    if (!title || !event.url) return [];
    const date = event.start_date ?? event.start?.local?.slice(0, 10);
    const venue = event.primary_venue?.name ?? undefined;
    return [{ title, url: event.url, date, venue, provider: "eventbrite" as const, content: [date, venue].filter(Boolean).join(" · ") }];
  });
}
