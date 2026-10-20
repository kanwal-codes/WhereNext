import React from "react";
import { vi } from "vitest";

export const TRIP = "11111111-1111-4111-8111-111111111111";

export const place = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  provider: "google-places", providerId: id, name, address: "1 Rue de Rivoli, Paris, France", category: "restaurant", rating: 4.5, userRatingCount: 1000, ...over,
});
export const event = (url: string, title: string, date?: string) => ({ title, url, date, source: "ticketmaster" });
export const stay = (hotelId: string, name: string, over: Record<string, unknown> = {}) => ({ hotelId, name, thumbnail: null, nightlyAmount: 200, currency: "EUR", stars: 4, rating: 8.5, ...over });

export type Call = { method: string; url: string };

/**
 * A fake Discover backend. `places` maps a substring of the query to the places it returns ("" matches everything);
 * the first matching key wins. Events and stays are fixed lists, events can be paged.
 */
export function createApi(cfg: { places?: Record<string, unknown[]>; events?: unknown[][]; stays?: unknown[]; saved?: unknown[]; failAll?: boolean }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: init?.method ?? "GET", url });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (cfg.failAll) return json({}, 500);
    const u = new URL(url, "http://app.test");
    if (u.pathname.endsWith("/places")) {
      const q = u.searchParams.get("query");
      if (q === null) return json({ places: cfg.saved ?? [] });
      const key = Object.keys(cfg.places ?? {}).find((k) => q.toLowerCase().includes(k.toLowerCase()));
      return json({ places: key !== undefined ? cfg.places![key] : [] });
    }
    if (u.pathname.endsWith("/events")) {
      const page = Number(u.searchParams.get("page") ?? 0);
      return json({ events: (cfg.events ?? [])[page] ?? [] });
    }
    if (u.pathname.endsWith("/stays")) return json({ options: cfg.stays ?? [] });
    return json({});
  }));
  const placeQueries = () => calls.filter((c) => c.url.includes("/places?query=")).map((c) => decodeURIComponent(new URL(c.url, "http://app.test").searchParams.get("query")!));
  return { calls, placeQueries, count: (part: string) => calls.filter((c) => c.url.includes(part)).length };
}

export const matchMedia = (matches: boolean) =>
  ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;

/** Light stand-ins for the cards and chrome, so a test sees Discover's own behaviour. */
export const stubs = {
  PlaceCard: ({ place: p, why, phoneTile }: { place: { name: string }; why?: string; phoneTile?: string }) => <article data-testid="place" data-mode={phoneTile}>{p.name}{why ? <em> ({why})</em> : null}</article>,
  EventCard: ({ event: e, phoneTile }: { event: { title: string }; phoneTile?: string }) => <article data-testid="event" data-mode={phoneTile}>{e.title}</article>,
  StayResultCard: ({ stay: s }: { stay: { name: string } }) => <article data-testid="stay">{s.name}</article>,
  DiscoverTile: ({ title }: { title: string }) => <div data-testid="tile">{title}</div>,
  AiSearchBar: ({ onDirective }: { onDirective: (d: unknown, raw: string) => void }) => (
    <div>
      <button type="button" onClick={() => onDirective({ freeText: "rooftop bars", categories: [] }, "rooftop bars")}>ask: rooftop bars</button>
      <button type="button" onClick={() => onDirective({ freeText: "rooftop bars", location: "Montmartre", categories: [] }, "rooftop bars near Montmartre")}>ask: rooftops near</button>
      <button type="button" onClick={() => onDirective({ freeText: "", categories: ["nightlife"], subChips: ["Clubs"] }, "nightlife")}>ask: nightlife</button>
    </div>
  ),
  CityChips: ({ current }: { current: string }) => <div>CITY {current}</div>,
  CityPill: ({ city }: { city: string }) => <div>PILL {city}</div>,
  SwapView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SegmentedSwitch: () => null,
};
