import { congestionRuns, routeMetrics, tagRoutes, trafficSummary } from "@/lib/application/route-overlay";
import { TRAFFIC_HEX } from "@/lib/application/mode-visuals";
import { whenLabel, type When } from "@/lib/application/travel-time";
import { dateFormat, numberFormat } from "@/lib/format-cache";
import { durationFromSeconds, formatDuration } from "@/lib/utils";
import type { FlightOffer } from "@/packages/providers/duffel/client";

export type Step = {
  mode?: string;
  durationSeconds?: number;
  line?: string;
  vehicleName?: string;
  agency?: string;
  color?: string;
  headsign?: string;
  stopCount?: number;
  departureStop?: string;
  arrivalStop?: string;
  polyline?: Array<[number, number]>;
};
export type Route = {
  durationSeconds: number;
  distanceMeters: number;
  steps?: Step[];
  departureTime?: string;
  timeZone?: string;
  arrivalTime?: string;
  fare?: { amount: number; currency: string };
  polyline?: Array<[number, number]>;
};
export type Flight = FlightOffer;
export type DriveRoute = { distanceMeters: number; durationSeconds: number; geometry: { coordinates: Array<[number, number]> }; congestion?: string[] };
/** A piece of a route to paint on the map. */
export type MapLegShape = { polyline: Array<[number, number]>; mode: string; color?: string };

export const hexColor = (c?: string) => (c ? `#${c.replace(/^#/, "")}` : undefined);

/** Where to buy it: Google Flights, on this flight's airports and day (these are Google's own fares; nothing is sold here). */
export const googleFlightsUrl = (f: Flight, returnDate: string) => {
  const day = f.departAt?.slice(0, 10);
  const query = `Flights from ${f.originAirport ?? ""} to ${f.destinationAirport ?? ""}${day ? ` on ${day}` : ""}${returnDate ? ` returning ${returnDate}` : ""}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
};

/** A time as the clocks read where the journey starts (`timeZone`), not where the reader is. */
export const clock = (iso?: string, timeZone?: string) => {
  if (!iso) return null;
  try {
    return dateFormat([], { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
};
export const money = (f?: Route["fare"]) => {
  if (!f) return null;
  try {
    return numberFormat(undefined, { style: "currency", currency: f.currency }).format(f.amount);
  } catch {
    return `${f.amount.toFixed(2)} ${f.currency}`;
  }
};

/** The legs to paint on the map for a chosen route — real per-step shapes, else the whole line. */
export function legsFor(route: Route): MapLegShape[] {
  const geo = (route.steps ?? []).filter((s): s is Step & { polyline: Array<[number, number]> } => Boolean(s.polyline && s.polyline.length >= 2));
  if (geo.length) return geo.map((s) => ({ polyline: s.polyline, mode: s.mode ?? "transit", color: hexColor(s.color) }));
  if (route.polyline && route.polyline.length >= 2) return [{ polyline: route.polyline, mode: "transit" }];
  return [];
}

/** The whole line of a route, for drawing it behind the chosen one and for putting its time on it. */
export function pathOf(route: Route): Array<[number, number]> {
  if (route.polyline && route.polyline.length >= 2) return route.polyline;
  return (route.steps ?? []).flatMap((s) => s.polyline ?? []);
}

/** A one-line summary of every route, handed to the assistant as on-screen context. */
export function describeRoutes(from: string, to: string, routes: Route[]): string {
  const lines = routes.map((r, i) => {
    const ride = (r.steps ?? [])
      .filter((s) => (s.mode ?? "") !== "walk")
      .map((s) => `${s.line ?? s.vehicleName ?? s.mode}${s.headsign ? ` toward ${s.headsign}` : ""}${s.stopCount ? ` (${s.stopCount} stops)` : ""}${s.agency ? ` — ${s.agency}` : ""}`)
      .join("; ");
    const dep = clock(r.departureTime, r.timeZone);
    const arr = clock(r.arrivalTime, r.timeZone);
    return `Option ${i + 1}: ${durationFromSeconds(r.durationSeconds)}, ${(r.distanceMeters / 1000).toFixed(1)} km${dep && arr ? `, leave ${dep} arrive ${arr}` : ""}${money(r.fare) ? `, fare ${money(r.fare)}` : ""}${ride ? ` — ${ride}` : ""}`;
  });
  return `Ways to get from ${from} to ${to}:\n${lines.join("\n")}`;
}

/** Back-to-back walking steps (a road crossing, a platform change) are one walk. */
export function mergeWalks(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const st of steps) {
    const prev = out[out.length - 1];
    const walking = (st.mode ?? "").toLowerCase() === "walk";
    if (walking && prev && (prev.mode ?? "").toLowerCase() === "walk") {
      out[out.length - 1] = { ...prev, durationSeconds: (prev.durationSeconds ?? 0) + (st.durationSeconds ?? 0), arrivalStop: st.arrivalStop ?? prev.arrivalStop, polyline: [...(prev.polyline ?? []), ...(st.polyline ?? [])] };
    } else out.push(st);
  }
  return out;
}

/** For each route: its length in minutes, the changes it asks for and the walking in it, and which is fastest / fewest changes / least walking. */
export function routeSummaries(routes: Route[]) {
  const meta = routes.map((r) => {
    const parts = mergeWalks(r.steps ?? []).map((st) => ({ mode: (st.mode ?? "transit").toLowerCase(), minutes: (st.durationSeconds ?? 0) / 60 }));
    return { minutes: r.durationSeconds / 60, ...routeMetrics(parts) };
  });
  return { meta, tags: tagRoutes(meta) };
}

/** The index of the quickest route. */
export const fastestIndex = (routes: Route[]) => routes.reduce((best, r, i) => (r.durationSeconds < routes[best].durationSeconds ? i : best), 0);

/** The driving route's traffic as a bar of coloured stretches (neighbours of one colour are one stretch), plus a one-line summary. */
export function driveTrafficOf(route: DriveRoute | null) {
  const runs = route ? congestionRuns(route.geometry.coordinates, route.congestion) : [];
  const summary = trafficSummary(runs);
  // For the bar, stretches Mapbox has no reading for count as flowing.
  const barColor = (level: string) => (level === "heavy" ? TRAFFIC_HEX.heavy : level === "severe" ? TRAFFIC_HEX.severe : level === "moderate" ? TRAFFIC_HEX.slow : "#2f8e60");
  const bar = runs.reduce<Array<{ color: string; km: number }>>((acc, run) => {
    const color = barColor(run.level);
    const prev = acc[acc.length - 1];
    if (prev && prev.color === color) prev.km += run.km;
    else acc.push({ color, km: run.km });
    return acc;
  }, []);
  return { runs, traffic: summary ? { bar, summary } : null };
}

/** The cheapest flight, and its price as "from €95" (no cents). */
export function cheapestFlight(flights: Flight[]): { flight: Flight; from: string | null } | null {
  if (!flights.length) return null;
  const flight = flights.reduce((best, f) => (Number(f.priceAmount) < Number(best.priceAmount) ? f : best));
  try {
    return { flight, from: numberFormat(undefined, { style: "currency", currency: flight.priceCurrency, maximumFractionDigits: 0 }).format(Number(flight.priceAmount)) };
  } catch {
    return { flight, from: null };
  }
}

/** One flight's price with cents, falling back to the plain amount and currency code for a currency the browser does not know. */
export function flightPrice(f: Flight): string {
  try {
    return numberFormat(undefined, { style: "currency", currency: f.priceCurrency }).format(Number(f.priceAmount));
  } catch {
    return `${f.priceAmount} ${f.priceCurrency}`;
  }
}

/** A flight's clock time, or "" for a bad timestamp. */
export function flightClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFormat([], { hour: "numeric", minute: "2-digit" }).format(d);
}

export const stopsLabel = (stops: number) => (stops === 0 ? "non-stop" : `${stops} stop${stops === 1 ? "" : "s"}`);

const TRY_AGAIN = "Try again in a moment.";

/** The line under the transit results. */
export function transitStatusText(input: { ok: boolean; count: number; when: When | null; timeIgnored: boolean }): string {
  if (!input.ok) return `We couldn’t load routes just now. ${TRY_AGAIN}`;
  if (input.count === 0) return "No public transit route between those two places.";
  return `${input.count} route${input.count === 1 ? "" : "s"}${input.when && !input.timeIgnored ? ` · ${whenLabel(input.when)}` : ""}`;
}

/** The line under the flight results. */
export function flightsStatusText(input: { ok: boolean; count: number; assumedDate: boolean; travellers: number }): string {
  if (!input.ok) return `We couldn’t load flights just now. ${TRY_AGAIN}`;
  if (input.count === 0) return "No flights came back for those two places. Flights run between airports, so try a city or an airport name.";
  return `${input.count} flight${input.count === 1 ? "" : "s"}${input.assumedDate ? " · example date — pick a day above for accurate prices" : ""}${input.travellers > 1 ? ` · prices for ${input.travellers} travellers` : ""}`;
}

export const uberHref = (from: string, to: string) => `uber://?action=setPickup&pickup[formatted_address]=${encodeURIComponent(from)}&dropoff[formatted_address]=${encodeURIComponent(to)}`;
export const lyftHref = (ends: { from: [number, number]; to: [number, number] }) =>
  `lyft://ridetype?id=lyft&pickup[latitude]=${ends.from[1]}&pickup[longitude]=${ends.from[0]}&destination[latitude]=${ends.to[1]}&destination[longitude]=${ends.to[0]}`;
export const googleMapsTransitUrl = (from: string, to: string) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`;

/** What a saved transit route records. */
export function transitSaveValue(route: Route, from: string, to: string) {
  const rides = mergeWalks(route.steps ?? []).filter((st) => (st.mode ?? "") !== "walk");
  return {
    mode: rides[0]?.mode ?? "transit",
    minutes: Math.round(route.durationSeconds / 60),
    fare: route.fare ? `${route.fare.amount} ${route.fare.currency}` : null,
    departAt: route.departureTime,
    arriveAt: route.arrivalTime,
    summary: describeRoutes(from, to, [route]).split("\n")[1] ?? "",
  };
}

/** What a saved flight records. */
export function flightSaveValue(f: Flight, price: string) {
  return {
    mode: "flight",
    airline: f.airline,
    minutes: f.durationMinutes,
    fare: `${f.priceAmount} ${f.priceCurrency}`,
    stops: f.stops,
    departAt: f.departAt,
    arriveAt: f.arriveAt,
    summary: `${f.airline}, ${price}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}`,
  };
}

/** What a saved drive records. */
export const driveSaveValue = (d: DriveRoute) => ({
  mode: "drive",
  minutes: Math.round(d.durationSeconds / 60),
  km: Math.round(d.distanceMeters / 100) / 10,
  name: `Drive, ${durationFromSeconds(d.durationSeconds)}`,
});

/** The on-screen context handed to the assistant when asked to compare the options. */
export function compareContext(input: { from: string; to: string; when: When | null; returnDate: string; travellers: number; routes: Route[]; driveRoute: DriveRoute | null; flights: Flight[] }): string {
  const { from, to, when, returnDate, travellers, routes, driveRoute, flights } = input;
  return [
    `Travelling ${whenLabel(when).toLowerCase()}${returnDate ? `, returning ${returnDate}` : ""}, ${travellers} traveller${travellers === 1 ? "" : "s"}.`,
    routes.length > 0 ? describeRoutes(from, to, routes) : "",
    driveRoute ? `Driving: ${durationFromSeconds(driveRoute.durationSeconds)}, ${(driveRoute.distanceMeters / 1000).toFixed(1)} km.` : "",
    flights.length > 0
      ? `Flights from ${from} to ${to}:\n` + flights.map((f, i) => `Option ${i + 1}: ${f.airline}, ${f.priceAmount} ${f.priceCurrency}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}`).join("\n")
      : "",
  ].filter(Boolean).join("\n\n");
}
