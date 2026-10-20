import React from "react";
import { vi } from "vitest";
import type { ItineraryItem } from "../../features/itinerary/domain/item";
import type { Reservation } from "../../packages/contracts/reservation";

export const TRIP = "11111111-1111-4111-8111-111111111111";

export const stop = (title: string, day: number, position: number, metadata: Record<string, unknown> | null = null): ItineraryItem => ({
  id: `id-${title}`, title, day_index: day, position, metadata, created_at: `2026-10-0${1 + position}T00:00:00Z`,
});

export const booking = (over: Partial<Reservation> = {}): Reservation => ({
  id: "r1", kind: "tour", title: "Food tour", startsOn: "2026-10-10", endsOn: null, startTime: "10:00", endTime: null, place: null, toPlace: null,
  confirmationCode: null, amount: null, currency: null, amountBasis: "total", travellers: null, status: "confirmed", notes: null, attachments: [], createdAt: "2026-09-01T00:00:00Z", ...over,
});

export type Call = { method: string; url: string; body?: Record<string, unknown> };
export type Reply = { status?: number; json?: unknown };
export type Handler = (call: Call) => Reply | undefined | Promise<Reply | undefined>;

/** A fake itinerary API. `state.items` is what GET returns; `state.reservations` what the bookings list returns. */
export function createApi(state: { items: ItineraryItem[]; reservations: Reservation[]; places?: unknown[] }) {
  const calls: Call[] = [];
  const handlers: Handler[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const out = await h(call);
      if (out) return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (call.method === "GET" && call.url.endsWith("/itinerary")) return json({ items: state.items });
    if (call.method === "GET" && call.url.endsWith("/reservations")) return json({ reservations: state.reservations });
    if (call.method === "GET" && call.url.includes("/places?query=")) return json({ places: state.places ?? [] });
    return json({});
  }));
  return { calls, handlers, ofMethod: (method: string) => calls.filter((c) => c.method === method && c.url.endsWith("/itinerary")) };
}

export function stubBrowser() {
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}

export const matchMedia = (matches: boolean) =>
  ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;

/** Stand-ins for the heavy children, so a test sees only the itinerary's own behaviour. */
export const mockChildren = {
  DestinationCombobox: ({ value, onChange, onPick, onEnter }: { value: string; onChange: (v: string) => void; onPick: (s: { placeId: string; text: string }) => void; onEnter?: () => void }) => (
    <div>
      <input aria-label="Add itinerary item" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }} />
      <button type="button" onClick={() => onPick({ placeId: "place-louvre", text: "Louvre Museum" })}>pick suggestion</button>
    </div>
  ),
  TimeField: ({ value, onChange, ariaLabel, disabled }: { value: string; onChange: (v: string) => void; ariaLabel: string; disabled?: boolean }) => (
    <input type="time" aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
  kindMeta: new Proxy({}, { get: () => ({ label: "x", icon: () => null }) }),
};
