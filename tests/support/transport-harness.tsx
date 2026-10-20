import React from "react";
import { vi } from "vitest";

export const TRIP = "11111111-1111-4111-8111-111111111111";

export const PLACES: Record<string, [number, number]> = { Paris: [2.35, 48.85], Lyon: [4.83, 45.76], Versailles: [2.13, 48.8] };

export const route = (over: Record<string, unknown> = {}) => ({
  durationSeconds: 1800, distanceMeters: 8000, departureTime: "2026-12-01T09:00:00Z", arrivalTime: "2026-12-01T09:30:00Z", timeZone: "UTC",
  fare: { amount: 2.5, currency: "EUR" }, polyline: [[0, 0], [1, 1]],
  steps: [
    { mode: "walk", durationSeconds: 300, arrivalStop: "Gare" },
    { mode: "subway", line: "1", headsign: "La Défense", durationSeconds: 1200, departureStop: "Gare", arrivalStop: "Centre", stopCount: 5, polyline: [[0, 0], [1, 1]] },
    { mode: "walk", durationSeconds: 300 },
  ],
  ...over,
});

export const flight = (id: string, over: Record<string, unknown> = {}) => ({
  id, airline: "Air Test", priceAmount: "100", priceCurrency: "EUR", durationMinutes: 80, stops: 0,
  departAt: "2026-12-01T08:00:00", arriveAt: "2026-12-01T09:20:00", originAirport: "CDG", destinationAirport: "LYS", passengerIds: [], ...over,
});

export const driveRoute = { distanceMeters: 465000, durationSeconds: 16200, geometry: { coordinates: [[2.35, 48.85], [3.5, 47], [4.83, 45.76]] }, congestion: ["low", "heavy"] };

export type Call = { method: string; url: string; body?: Record<string, any> };
type Cfg = { transit?: unknown[] | "fail"; drive?: unknown | "fail" | null; flights?: unknown[] | "fail"; flightsAssumedDate?: boolean; usdRate?: { currency: string; rate: number } | null; decisionOk?: boolean };

/** A fake transport backend: geocoding by place name, then transit, driving, flights and the decisions endpoint. */
export function createApi(cfg: Cfg) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const call: Call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/geocode")) {
      const q = decodeURIComponent(new URL(url, "http://x").searchParams.get("q") ?? "");
      const hit = PLACES[q];
      return hit ? json({ lng: hit[0], lat: hit[1] }) : json({}, 404);
    }
    if (url.endsWith("/transit")) return cfg.transit === "fail" ? json({}, 500) : json({ routes: cfg.transit ?? [] });
    if (url.endsWith("/directions")) return cfg.drive === "fail" ? json({}, 500) : json({ route: cfg.drive ?? null, usdRate: cfg.usdRate ?? null });
    if (url.endsWith("/flights")) return cfg.flights === "fail" ? json({}, 500) : json({ offers: cfg.flights ?? [], assumedDate: cfg.flightsAssumedDate });
    if (url.endsWith("/decisions")) return json({}, cfg.decisionOk === false ? 500 : 200);
    return json({});
  }));
  const posts = (suffix: string) => calls.filter((c) => c.method === "POST" && c.url.endsWith(suffix));
  return { calls, posts };
}

export const matchMedia = (matches: boolean) =>
  ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;

/** Stand-ins for the heavy children, so a test sees the transport screen's own behaviour. */
export const stubs = {
  DestinationCombobox: ({ ariaLabel, value, onChange, onSelect, inputRef }: { ariaLabel: string; value: string; onChange: (v: string) => void; onSelect: (v: string) => void; inputRef?: React.Ref<HTMLInputElement> }) => (
    <div>
      <input ref={inputRef} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onSelect(value)}>{`pick ${ariaLabel}`}</button>
    </div>
  ),
  SegmentedSwitch: ({ options, value, onChange, label }: { options: Array<{ key: string; ariaLabel?: string }>; value: string; onChange: (k: never) => void; label: string }) => (
    <div role="tablist" aria-label={label}>
      {options.map((o) => <button key={o.key} type="button" role="tab" aria-selected={o.key === value} aria-label={o.ariaLabel ?? o.key} onClick={() => onChange(o.key as never)}>{o.key}</button>)}
    </div>
  ),
  TripOptions: ({ onWhen, onTravellers, onReturnDate, travellers, when, returnDate }: { onWhen: (w: unknown) => void; onTravellers: (n: number) => void; onReturnDate: (d: string) => void; travellers: number; when: unknown; returnDate: string }) => (
    <div>
      <button type="button" onClick={() => onWhen({ kind: "depart", date: "2026-12-01", time: "09:30" })}>set leave at 09:30</button>
      <button type="button" onClick={() => onTravellers(3)}>set 3 travellers</button>
      <button type="button" onClick={() => onReturnDate("2026-12-08")}>set return date</button>
      <span data-testid="options">{JSON.stringify({ travellers, when, returnDate })}</span>
    </div>
  ),
  FlightDetails: () => <div>FLIGHT DETAILS</div>,
  AirlineMark: () => null,
  modeParts: { ModeTile: () => null, Ribbon: () => null, colorOf: () => "#000", railStyle: () => ({}) },
};
