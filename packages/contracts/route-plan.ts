/** A day-by-day travel plan for an itinerary: how you actually get from each stop to the next. */

type LegMode = "walk" | "bus" | "subway" | "tram" | "train" | "ferry" | "transit" | "drive" | "flight" | "unknown";

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
  /** [lng, lat] pairs for just this step, so the map can draw each part of a journey in its own mode. */
  polyline?: Array<[number, number]>;
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
  /** Other viable ways to make this hop — pick one to lock it in via /decisions (kind: "leg_transport"). */
  alternatives: Array<{ mode: LegMode; minutes: number; km: number; fare: { amount: number; currency: string } | null }>;
  /** Set only when both stops either side of this leg have a clock time: is there enough of a
   * gap between them to cover the travel? `availableMinutes` can be negative (times entered
   * out of order or past midnight) — treat any non-positive slack as infeasible too. */
  timeFit: { availableMinutes: number; neededMinutes: number } | null;
};

export type RouteDay = {
  day: number;
  stops: Array<{ id: string; name: string; lat: number; lng: number; time?: string }>;
  legs: RouteLeg[];
  summary: { movingMinutes: number; transitRides: number; fare: { amount: number; currency: string } | null };
  /** What is already booked for this day (hotels, flights, trains, tickets), from the Bookings page. */
  booked?: Array<{ kind: string; title: string; detail: string | null }>;
};

export type RoutePlan = { days: RouteDay[]; unplaced: string[] };
