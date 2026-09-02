/** A day-by-day travel plan for an itinerary: how you actually get from each stop to the next. */

export type LegMode = "walk" | "bus" | "subway" | "tram" | "train" | "ferry" | "transit" | "drive" | "unknown";

export type RouteLegStep = {
  mode: string;
  minutes: number;
  line?: string;
  agency?: string;
  color?: string;
  headsign?: string;
  stopCount?: number;
  from?: string;
  to?: string;
};

export type RouteLeg = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** "local" = a routable hop; "longhaul" = intercity, compare flights/trains instead. */
  kind: "local" | "longhaul";
  mode: LegMode;
  minutes: number | null;
  km: number | null;
  fare: { amount: number; currency: string } | null;
  departure: string | null;
  arrival: string | null;
  steps: RouteLegStep[];
  /** [lng, lat] pairs to draw on the map. */
  polyline: Array<[number, number]>;
  note: string | null;
};

export type RouteDay = {
  day: number;
  stops: Array<{ id: string; name: string; lat: number; lng: number }>;
  legs: RouteLeg[];
  summary: { movingMinutes: number; transitRides: number; fare: { amount: number; currency: string } | null };
};

export type RoutePlan = { days: RouteDay[]; unplaced: string[] };
