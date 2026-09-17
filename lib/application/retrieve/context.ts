import type { Place } from "@/packages/contracts/place";
import type { WeatherDay } from "@/packages/providers/openweather/client";
import type { EventResult, FlightSearch, RouteResult, StaySearch } from "../retrieve";

// Event listings and general web research content rarely change meaningfully within minutes —
// unlike weather/rates/live-route caches (5 min, set per call site), a flat 5-minute TTL here
// just made two trip members asking about "things to do" a few minutes apart re-pay for the
// identical paid Ticketmaster/Eventbrite/Tavily call. Shared by every handler that hits one of
// those three providers, so it lives here rather than duplicated per handler file.
export const RESEARCH_CACHE_MS = 30 * 60_000;

export type RetrieveFilters = {
  dislikes?: string[];
  currency?: string;
  interests?: string[];
  likes?: string[];
  tripStart?: string | null;
  tripEnd?: string | null;
  /** Exact place names to drop from results — the trip's rejected places. */
  excludeNames?: string[];
  /** Trip party size — hotel rates should reflect who's actually going, not a 2-adult default. */
  travelers?: number | null;
  /** A stated accessibility requirement (wheelchair accessible, step-free, etc.) is a HARD
   *  constraint, not a soft preference like dislikes — see lib/application/preference-filter.ts. */
  accessibilityNeeds?: string[];
};

/**
 * Per-turn mutable state + shared helpers a tool handler needs, replacing the closures
 * `retrieveEvidence` used to define inline (Phase 1.2,
 * docs/overhaul/roadmap/phase-1-structural-refactor.md). One `ctx` is built once per
 * `retrieveEvidence` call and passed to every handler the tool plan dispatches to; handlers push
 * onto its arrays / set its fields directly — safe with no locking since JS handler bodies never
 * interleave mid-synchronous-section, only at `await` points.
 */
export type RetrieveContext = {
  filters: RetrieveFilters;
  signal?: AbortSignal;
  /** `fail(providerName)` — pass to `.catch(...)` on a provider call; records the provider as
   *  unavailable (once) and swallows the error, unless the turn itself was aborted. */
  fail: (name: string) => (error: unknown) => undefined;
  /** Geocode a place name to `[longitude, latitude]`, memoized per-turn (in-flight promise) and
   *  cached across turns (24h). Failures go through `fail("google-places")` internally. */
  geocode: (name: string) => Promise<[number, number] | null>;
  /** Collapse a transit plan's short walk legs into readable steps. */
  formatTransitSteps: (steps: Array<{ mode: string; durationSeconds: number; line?: string; arrivalStop?: string }>) => string[];
  places: Place[];
  rawPlaceGroups: Array<{ index: number; label: string; places: Place[] }>;
  sources: Array<{ title: string; url: string; content: string }>;
  routes: RouteResult[];
  eventList: EventResult[];
  /** Set by the events handler when the query had nothing specific — "what's on?" gets ordered
   *  by pull (bigger events first) rather than by date. */
  eventsBroad: boolean;
  flights: FlightSearch[];
  stays: StaySearch[];
  weather: { summary: string | null; days: WeatherDay[] };
};
