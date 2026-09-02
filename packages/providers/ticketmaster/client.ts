import { withProviderTimeout } from "../request-signal";

export type EventResult = { title: string; url: string; date?: string; venue?: string; content: string; imageUrl?: string };

export async function events(query: string, destination: string, signal?: AbortSignal): Promise<EventResult[]> {
  const key = process.env.TICKETMASTER_CONSUMER_KEY ?? process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error("TICKETMASTER_API_KEY is not configured");
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", key);
  url.searchParams.set("city", destination);
  if (query) url.searchParams.set("keyword", query);
  url.searchParams.set("size", "8");
  url.searchParams.set("sort", "date,asc");
  const response = await fetch(url, { signal: withProviderTimeout(signal) });
  if (!response.ok) throw new Error(`Ticketmaster search failed: ${response.status}`);
  const body = await response.json() as {
    _embedded?: { events?: Array<{
      name?: string; url?: string;
      dates?: { start?: { localDate?: string; localTime?: string } };
      _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> };
      images?: Array<{ url?: string; width?: number }>;
    }> };
  };
  return (body._embedded?.events ?? []).flatMap((event) => {
    if (!event.name || !event.url) return [];
    const start = event.dates?.start;
    const date = [start?.localDate, start?.localTime?.slice(0, 5)].filter(Boolean).join(" ");
    const venueName = event._embedded?.venues?.[0]?.name;
    const city = event._embedded?.venues?.[0]?.city?.name;
    const venue = [venueName, city].filter(Boolean).join(", ");
    return [{
      title: event.name,
      url: event.url,
      date: date || undefined,
      venue: venue || undefined,
      content: [date, venue].filter(Boolean).join(" · "),
      imageUrl: event.images?.find((image) => image.url)?.url,
    }];
  });
}
