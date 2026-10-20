"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDistance } from "@/lib/use-distance";
import Link from "next/link";
import { ArrowDownUp, Car, ChevronDown, ExternalLink, Loader2, Plane, Search, TrainFront } from "lucide-react";
import type { MapLeg } from "@/components/TripMap";
import { congestionRuns, interchangeNodes, routeMetrics, tagRoutes, trafficSummary, type MapOverlay, type RouteTag } from "@/lib/application/route-overlay";
import { askAssistantHref } from "@/lib/places-ui";
import { notifyToast } from "@/lib/application/toast";
import { estimateRideshare } from "@/lib/application/rideshare-estimate";
import { greatCircleArc, haversineKm } from "@/lib/application/geo";
import { cn, durationFromSeconds, formatDuration } from "@/lib/utils";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { TripOptions } from "./TripOptions";
import { FlightDetails } from "./FlightDetails";
import { AirlineMark } from "@/features/conversation/ui/panels/OtherFlights";
import type { FlightOffer } from "@/packages/providers/duffel/client";
import { arrangeFlights, departAtParam, fitsTime, todayLocal, whenLabel, type Sort, type When } from "@/lib/application/travel-time";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { resolveCurrency } from "@/lib/currency";
import { MODE_LABEL, TRAFFIC_HEX } from "@/lib/application/mode-visuals";
import { ModeTile, Ribbon, colorOf, railStyle } from "@/features/maps/ui/modeParts";

const hexColor = (c?: string) => (c ? `#${c.replace(/^#/, "")}` : undefined);

type Step = {
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
type Route = {
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

/** Where to buy it: Google Flights, on this flight's airports and day (these are Google's own fares; nothing is sold here). */
const googleFlightsUrl = (f: Flight, returnDate: string) => {
  const day = f.departAt?.slice(0, 10);
  const query = `Flights from ${f.originAirport ?? ""} to ${f.destinationAirport ?? ""}${day ? ` on ${day}` : ""}${returnDate ? ` returning ${returnDate}` : ""}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
};
type DriveRoute = { distanceMeters: number; durationSeconds: number; geometry: { coordinates: Array<[number, number]> }; congestion?: string[] };

/** What the AI search bar (or a caller) can push in to run a search without the user retyping. */
export type TransportPreset = { from?: string; to?: string; modes?: string[]; nonce: number };

/** A time as the clocks read where the journey starts (`timeZone`), not where the reader is. */
const clock = (iso?: string, timeZone?: string) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
};
const money = (f?: Route["fare"]) => {
  if (!f) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: f.currency }).format(f.amount);
  } catch {
    return `${f.amount.toFixed(2)} ${f.currency}`;
  }
};

/** The legs to paint on the map for a chosen route — real per-step shapes, else the whole line. */
function legsFor(route: Route): MapLeg[] {
  const geo = (route.steps ?? []).filter((s): s is Step & { polyline: Array<[number, number]> } => Boolean(s.polyline && s.polyline.length >= 2));
  if (geo.length) return geo.map((s) => ({ polyline: s.polyline, mode: s.mode ?? "transit", color: hexColor(s.color) }));
  if (route.polyline && route.polyline.length >= 2) return [{ polyline: route.polyline, mode: "transit" }];
  return [];
}

/** The whole line of a route, for drawing it behind the chosen one and for putting its time on it. */
function pathOf(route: Route): Array<[number, number]> {
  if (route.polyline && route.polyline.length >= 2) return route.polyline;
  return (route.steps ?? []).flatMap((s) => s.polyline ?? []);
}

const TAG_TEXT: Record<RouteTag, string> = { fastest: "Fastest", "fewer-changes": "Fewer changes", "least-walking": "Least walking" };

/** A one-line summary of every route, handed to the assistant as on-screen context. */
function describeRoutes(from: string, to: string, routes: Route[]): string {
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
function mergeWalks(steps: Step[]): Step[] {
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

function StepRow({ step, last }: { step: Step; last: boolean }) {
  const mode = (step.mode ?? "transit").toLowerCase();
  const walking = mode === "walk";
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        <ModeTile mode={mode} />
        {!last && <span className="my-1.5 w-1 flex-1" style={railStyle(mode)} aria-hidden="true" />}
      </div>
      <div className={cn("min-w-0 pt-1 text-sm leading-snug", !last && "pb-5")}>
        {walking ? (
          <p className="font-medium">Walk {durationFromSeconds(step.durationSeconds ?? 0)}{step.arrivalStop ? <span className="font-normal text-muted-foreground"> to {step.arrivalStop}</span> : null}</p>
        ) : (
          <>
            <p className="font-medium">
              {step.line && (
                <span className="mr-1.5 rounded-md px-1.5 py-0.5 align-[1px] text-2xs font-semibold text-white" style={{ background: hexColor(step.color) ?? colorOf(mode) }}>{step.line}</span>
              )}
              {step.headsign ? `toward ${step.headsign}` : step.vehicleName ?? MODE_LABEL[mode] ?? "Transit"}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {step.departureStop ?? "—"} → {step.arrivalStop ?? "—"}
              {step.stopCount ? ` · ${step.stopCount} stop${step.stopCount === 1 ? "" : "s"}` : ""} · {durationFromSeconds(step.durationSeconds ?? 0)}
              {step.agency ? ` · ${step.agency}` : ""}
            </p>
          </>
        )}
      </div>
    </li>
  );
}

export function TransportSurface({
  tripId,
  preset,
  onRoute,
  searchSlot,
  near,
}: {
  tripId: string;
  /** `[lng, lat]` of the trip's area: suggestions as you type are ranked toward it. */
  near?: [number, number];
  /** A search pushed in from outside (e.g. the AI bar). Bump `nonce` to run it. */
  preset?: TransportPreset;
  /** Called with the map legs for the chosen route (or null when cleared). */
  onRoute?: (legs: MapLeg[] | null, overlay?: MapOverlay) => void;
  /** An alternative way to fill in From/To (e.g. a natural-language ask bar), shown above the form in the same card. */
  searchSlot?: ReactNode;
}) {
  const distance = useDistance();
  // Left blank on purpose: a rider typing "Brampton to New York" in the AI search bar should
  // see exactly that in these fields once it resolves, not find one pre-filled with the trip's
  // own origin/destination before they've said anything.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [driveRoute, setDriveRoute] = useState<DriveRoute | null>(null);
  const [driveEnds, setDriveEnds] = useState<{ from: [number, number]; to: [number, number] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  // Transit and driving are searched together; flights too when the trip is long enough to fly (or when asked for).
  const [tab, setTab] = useState<"transit" | "drive" | "flight">("transit");
  const [transitStatus, setTransitStatus] = useState("");
  // What a US dollar is worth in the trip's currency: the rideshare estimate is built in dollars.
  const [usdRate, setUsdRate] = useState<{ currency: string; rate: number } | null>(null);
  const tripCurrency = resolveCurrency(useTripDataMaybe()?.data?.preferences as Record<string, unknown> | null | undefined);
  const [driveStatus, setDriveStatus] = useState("");
  const [flightsStatus, setFlightsStatus] = useState("");
  const [flightsLoading, setFlightsLoading] = useState(false);
  const flightsKey = useRef("");
  // When and who. The time is the clock where the journey starts; flights are searched by day, and the time filters them.
  const trip = useTripDataMaybe()?.data?.trip as { start_date?: string | null; end_date?: string | null; travelers?: number | null } | null | undefined;
  const [when, setWhen] = useState<When | null>(null);
  const [returnDate, setReturnDate] = useState("");
  const [travellers, setTravellers] = useState(Math.min(9, Math.max(1, Math.round(trip?.travelers ?? 1))));
  const [sort, setSort] = useState<Sort>("best");
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [anyTime, setAnyTime] = useState(false);
  const [openFlight, setOpenFlight] = useState<string | null>(null);
  const [timeNote, setTimeNote] = useState("");
  const queryRef = useRef({ a: "", b: "" });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const modesRef = useRef<string[]>([]);

  /** What the map shows besides the chosen route: the others (tap one to take it), the time on each, and where the vehicle changes. */
  function overlayFor(list: Route[], i: number): MapOverlay {
    const others = list.map((r, j) => ({ r, j })).filter(({ j }) => j !== i && pathOf(list[j]).length > 1);
    // Pills on neighbouring routes would land on the same spot; spread them along each route.
    const spread = [0.3, 0.7, 0.42, 0.58, 0.2, 0.8];
    return {
      ghosts: others.map(({ j }) => ({ id: `route-${j}`, polyline: pathOf(list[j]), onSelect: () => setSelected(j) })),
      pills: [
        { id: "chosen", polyline: pathOf(list[i]), text: durationFromSeconds(list[i].durationSeconds), tone: "main" as const },
        ...others.map(({ r, j }, k) => ({ id: `time-${j}`, polyline: pathOf(r), text: durationFromSeconds(r.durationSeconds), tone: "ghost" as const, at: spread[k % spread.length], onClick: () => setSelected(j) })),
      ],
      nodes: interchangeNodes(
        mergeWalks(list[i].steps ?? []).map((st) => ({ mode: (st.mode ?? "transit").toLowerCase(), polyline: st.polyline, from: st.departureStop, to: st.arrivalStop })),
        "chosen",
      ),
    };
  }

  function choose(i: number) {
    setSelected((cur) => (cur === i ? null : i));
  }

  async function geocode(q: string, signal: AbortSignal): Promise<[number, number] | null> {
    try {
      const r = await fetch(`/api/trips/${tripId}/geocode?q=${encodeURIComponent(q)}`, { signal });
      if (!r.ok) return null;
      const p = await r.json();
      return typeof p.lng === "number" && typeof p.lat === "number" ? [p.lng, p.lat] : null;
    } catch {
      return null;
    }
  }

  async function loadFlights(a: string, b: string) {
    const key = `${a}|${b}|${when?.date ?? ""}|${returnDate}|${travellers}`;
    if (!a || !b || flightsKey.current === key) return;
    flightsKey.current = key;
    setFlightsLoading(true);
    setFlightsStatus("");
    try {
      const res = await fetch(`/api/trips/${tripId}/flights`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: a, to: b, adults: travellers, ...(when ? { departureDate: when.date } : {}), ...(returnDate ? { returnDate } : {}) }) });
      const body = await res.json();
      const offers = (body.offers ?? []) as Flight[];
      if (flightsKey.current !== key) return;
      setFlights(offers);
      setFlightsStatus(
        !res.ok
          ? "We couldn’t load flights just now. Try again in a moment."
          : offers.length === 0
            ? "No flights came back for those two places. Flights run between airports, so try a city or an airport name."
            : `${offers.length} flight${offers.length === 1 ? "" : "s"}${body.assumedDate ? " · example date — pick a day above for accurate prices" : ""}${travellers > 1 ? ` · prices for ${travellers} travellers` : ""}`,
      );
    } catch {
      if (flightsKey.current === key) {
        flightsKey.current = "";
        setFlightsStatus("We couldn’t load flights just now. Try again in a moment.");
      }
    } finally {
      if (flightsKey.current === key || flightsKey.current === "") setFlightsLoading(false);
    }
  }

  async function search(over?: { from?: string; to?: string; modes?: string[]; keepTab?: boolean }) {
    const a = (over?.from ?? from).trim();
    const b = (over?.to ?? to).trim();
    if (over?.from !== undefined) setFrom(a);
    if (over?.to !== undefined) setTo(b);
    if (over?.modes) modesRef.current = over.modes;
    if (!a || !b) {
      setStatus("Enter both a start and a destination.");
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    queryRef.current = { a, b };
    flightsKey.current = "";
    setLoading(true);
    setStatus("");
    setTransitStatus("");
    setDriveStatus("");
    setTimeNote("");
    setAnyTime(false);
    setOpenFlight(null);
    setFlightsStatus("");
    setFlightsLoading(false);
    setSelected(null);
    setRoutes([]);
    setFlights([]);
    setDriveRoute(null);
    setDriveEnds(null);

    const modes = modesRef.current;
    const first = over?.keepTab ? tab : modes.includes("flight") ? "flight" : modes.includes("drive") ? "drive" : "transit";
    setTab(first);
    const aborted = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
    try {
      const coords = Promise.all([geocode(a, request.signal), geocode(b, request.signal)]);

      const transitJob = (async () => {
        try {
          // The time means the clock where the journey starts, so the server needs to know where that is.
          const start = when ? (await coords)[0] : null;
          const response = await fetch(`/api/trips/${tripId}/transit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin: a, destination: b, ...(when && start ? { when: { ...when, at: start } } : {}) }), signal: request.signal });
          const body = await response.json();
          const found = (body.routes ?? []) as Route[];
          setRoutes(found);
          if (body.timeIgnored) setTimeNote("We couldn’t use that time (it may have passed), so these are for now.");
          setTransitStatus(!response.ok ? "We couldn’t load routes just now. Try again in a moment." : found.length === 0 ? "No public transit route between those two places." : `${found.length} route${found.length === 1 ? "" : "s"}${when && !body.timeIgnored ? ` · ${whenLabel(when)}` : ""}`);
          if (response.ok && found.length) setSelected(found.reduce((best, r, i) => (r.durationSeconds < found[best].durationSeconds ? i : best), 0));
          return found.length;
        } catch (error) {
          if (aborted(error)) throw error;
          setTransitStatus("We couldn’t load routes just now. Try again in a moment.");
          return 0;
        }
      })();

      const driveJob = (async () => {
        try {
          const [oCoord, dCoord] = await coords;
          if (!oCoord || !dCoord) {
            setDriveStatus("Couldn’t find one of those places.");
            return false;
          }
          setDriveEnds({ from: oCoord, to: dCoord });
          const res = await fetch(`/api/trips/${tripId}/directions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin: oCoord, destination: dCoord, profile: "driving", traffic: true, currency: tripCurrency, ...(departAtParam(when) ? { departAt: departAtParam(when) } : {}) }), signal: request.signal });
          const body = await res.json();
          const route = res.ok ? (body.route as DriveRoute | undefined) ?? null : null;
          setUsdRate(body.usdRate ?? null);
          setDriveRoute(route);
          setDriveStatus(!res.ok ? "We couldn’t load a driving route just now. Try again in a moment." : !route ? "No driving route found between those two places." : "");
          return Boolean(route);
        } catch (error) {
          if (aborted(error)) throw error;
          setDriveStatus("We couldn’t load a driving route just now. Try again in a moment.");
          return false;
        }
      })();

      // Far enough that flying is a real option: look now, so the Flights tab is ready when it is opened.
      const flightsJob = (async () => {
        const [oCoord, dCoord] = await coords;
        const far = oCoord && dCoord && haversineKm({ latitude: oCoord[1], longitude: oCoord[0] }, { latitude: dCoord[1], longitude: dCoord[0] }) >= 300;
        if (first === "flight" || far) await loadFlights(a, b);
      })().catch(() => {});

      const [found, drove] = await Promise.all([transitJob, driveJob]);
      setSearched(true);
      if (first === "transit" && found === 0 && drove) setTab("drive");
      if (first === "flight") await flightsJob;
    } catch (error) {
      // A newer search has taken over: it owns the screen now.
      if (controller.current !== request) return;
      setRoutes([]);
      setFlights([]);
      setDriveRoute(null);
      setDriveEnds(null);
      setStatus(aborted(error) ? "Search cancelled." : "We couldn’t load routes just now. Try again in a moment.");
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  // Change the day, time or number of travellers and the results follow: the same search again, on the same tab.
  const optionsKey = JSON.stringify([when, returnDate, travellers]);
  const lastOptions = useRef(optionsKey);
  useEffect(() => {
    if (lastOptions.current === optionsKey) return;
    lastOptions.current = optionsKey;
    if (!searched) return;
    const timer = window.setTimeout(() => void search({ keepTab: true }), 500);
    return () => window.clearTimeout(timer);
    // `search` is rebuilt every render; the options are what should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  // The map shows whichever way of travelling is open.
  useEffect(() => {
    if (!onRoute) return;
    if (tab === "transit") {
      const route = selected != null ? routes[selected] : undefined;
      onRoute(route ? legsFor(route) : null, route ? overlayFor(routes, selected!) : undefined);
    } else if (tab === "drive") {
      onRoute(
        driveRoute ? congestionRuns(driveRoute.geometry.coordinates, driveRoute.congestion).map((run) => ({ polyline: run.polyline, mode: "drive", traffic: run.level })) : null,
        driveRoute ? { pills: [{ id: "drive", polyline: driveRoute.geometry.coordinates, text: durationFromSeconds(driveRoute.durationSeconds), tone: "main" }] } : undefined,
      );
    } else onRoute(driveEnds ? [{ polyline: greatCircleArc(driveEnds.from, driveEnds.to), mode: "flight" }] : null);
    // `overlayFor` and `onRoute` are rebuilt every render; these are what the map really depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, routes, selected, driveRoute, driveEnds]);

  async function saveChoice(value: Record<string, unknown>) {
    const r = await fetch(`/api/trips/${tripId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "transport", source: "user", value: { from, to, ...value } }),
    });
    notifyToast(r.ok ? "Saved to your trip." : "That didn’t save. Try again.", r.ok ? "success" : "error");
  }

  // Run a search pushed in from the AI bar.
  useEffect(() => {
    if (!preset?.nonce) return;
    void search({ from: preset.from, to: preset.to, modes: preset.modes ?? [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const routeMeta = routes.map((r) => {
    const parts = mergeWalks(r.steps ?? []).map((st) => ({ mode: (st.mode ?? "transit").toLowerCase(), minutes: (st.durationSeconds ?? 0) / 60 }));
    return { minutes: r.durationSeconds / 60, ...routeMetrics(parts) };
  });
  const routeTags = tagRoutes(routeMeta);
  const driveRuns = driveRoute ? congestionRuns(driveRoute.geometry.coordinates, driveRoute.congestion) : [];
  const driveSummary = trafficSummary(driveRuns);
  // For the bar, stretches Mapbox has no reading for count as flowing, and neighbours of one colour are one stretch.
  const barColor = (level: string) => (level === "heavy" ? TRAFFIC_HEX.heavy : level === "severe" ? TRAFFIC_HEX.severe : level === "moderate" ? TRAFFIC_HEX.slow : "#2f8e60");
  const driveBar = driveRuns.reduce<Array<{ color: string; km: number }>>((bar, run) => {
    const color = barColor(run.level);
    const prev = bar[bar.length - 1];
    if (prev && prev.color === color) prev.km += run.km;
    else bar.push({ color, km: run.km });
    return bar;
  }, []);
  const driveTraffic = driveSummary ? { bar: driveBar, summary: driveSummary } : null;
  const transitTime = routes.length ? durationFromSeconds(Math.min(...routes.map((r) => r.durationSeconds))) : "";
  const cheapest = flights.length ? flights.reduce((best, f) => (Number(f.priceAmount) < Number(best.priceAmount) ? f : best)) : null;
  const flightFrom = cheapest
    ? (() => {
        try {
          return new Intl.NumberFormat(undefined, { style: "currency", currency: cheapest.priceCurrency, maximumFractionDigits: 0 }).format(Number(cheapest.priceAmount));
        } catch {
          return null;
        }
      })()
    : null;
  const onTime = flights.filter((f) => anyTime || fitsTime(f, when));
  const shownFlights = arrangeFlights(onTime, sort, nonstopOnly);
  const field = "h-12 w-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70";
  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-display text-2xl font-medium tracking-[-0.018em]">Find your way there</h2>
        <p className="mt-1 text-sm text-muted-foreground">Any two places. The routes draw on the map.</p>
        {searchSlot && <div className="mt-5">{searchSlot}</div>}
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void search({ modes: [] });
          }}
        >
          <div className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl bg-surface px-4 py-1 ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
            <span className="grid place-items-center" aria-hidden="true"><span className="size-3 rounded-full bg-coral-fill ring-4 ring-coral-soft" /></span>
            <div className="min-w-0">
              <DestinationCombobox
                tripId={tripId}
                scope="places"
                near={near}
                ariaLabel="From"
                value={from}
                onChange={setFrom}
                onSelect={(text) => {
                  setFrom(text);
                  // After the dropdown has finished closing: focusing inside its own key handler is undone by it.
                  window.setTimeout(() => toRef.current?.focus(), 0);
                }}
                placeholder="From: station, address or place"
                inputClassName={`${field} pr-11`}
              />
            </div>
            <span aria-hidden="true" className="col-span-2 ml-[0.7rem] h-px bg-border" style={{ marginRight: "3rem" }} />
            <span className="grid place-items-center" aria-hidden="true"><span className="size-3 rounded-[3px] bg-primary" /></span>
            <div className="min-w-0">
              <DestinationCombobox
                tripId={tripId}
                scope="places"
                near={near}
                inputRef={toRef}
                ariaLabel="To"
                value={to}
                onChange={setTo}
                onSelect={(text) => {
                  setTo(text);
                  // Both ends known: no need to press Search.
                  if (from.trim()) void search({ to: text });
                }}
                placeholder="To: station, address or place"
                inputClassName={`${field} pr-11`}
              />
            </div>
            <button
              type="button"
              aria-label="Swap start and end"
              onClick={() => { setFrom(to); setTo(from); }}
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-ink-soft shadow-soft transition-[transform,color] duration-150 hover:text-foreground active:scale-95"
            >
              <ArrowDownUp className="size-4" aria-hidden="true" />
            </button>
          </div>
          <TripOptions
            when={when}
            onWhen={setWhen}
            travellers={travellers}
            onTravellers={setTravellers}
            returnDate={returnDate}
            onReturnDate={setReturnDate}
            tripDates={trip?.start_date && trip.start_date >= todayLocal() ? { start: trip.start_date, end: trip.end_date } : undefined}
          />
          <button type="submit" disabled={loading} className="btn-primary mt-3 w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {loading ? "Finding routes…" : "Search"}
          </button>
          {status && (
            <p role="status" className="mt-3 text-xs leading-snug text-muted-foreground">
              {status}
            </p>
          )}
        </form>
      </div>

      {searched && (
        <div className="space-y-4">
          <SegmentedSwitch
            label="Ways to get there"
            className="w-full [&>*]:flex-1"
            value={tab}
            onChange={(k) => {
              setTab(k);
              if (k === "flight") void loadFlights(queryRef.current.a, queryRef.current.b);
            }}
            options={[
              { key: "transit", ariaLabel: `Transit${routes.length ? `, ${transitTime}` : ""}`, label: <><TrainFront className="size-4" aria-hidden="true" />{routes.length ? transitTime : "Transit"}</> },
              { key: "drive", ariaLabel: `Drive${driveRoute ? `, ${durationFromSeconds(driveRoute.durationSeconds)}` : ""}`, label: <><Car className="size-4" aria-hidden="true" />{driveRoute ? durationFromSeconds(driveRoute.durationSeconds) : "Drive"}</> },
              { key: "flight", ariaLabel: `Flights${flightFrom ? `, from ${flightFrom}` : ""}`, label: <><Plane className="size-4" aria-hidden="true" />{flightFrom ?? "Flights"}</> },
            ]}
          />
          {tab === "transit" && routes.length === 0 && !loading && (
            <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">
              {transitStatus || "No public transit route between those two places."}
              {driveRoute ? " Driving is open in the Drive tab." : ""}
            </p>
          )}
          {tab === "transit" && routes.length > 0 && transitStatus && <p className="text-xs text-muted-foreground">{transitStatus}</p>}
          {tab === "transit" && timeNote && <p className="text-xs text-muted-foreground">{timeNote}</p>}
          {tab === "drive" && driveRoute && when?.kind === "arrive" && <p className="text-xs text-muted-foreground">Driving is planned for leaving, not arriving. Choose “Leave at” to see traffic for a time.</p>}
          {tab === "drive" && driveRoute && when?.kind === "depart" && <p className="text-xs text-muted-foreground">Typical traffic for {whenLabel(when).toLowerCase()}.</p>}
          {tab === "drive" && !driveRoute && <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">{driveStatus || "No driving route found between those two places."}</p>}
          {tab === "flight" && flightsLoading && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Looking for flights…
            </p>
          )}
          {tab === "flight" && !flightsLoading && flightsStatus && (flights.length === 0 ? <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">{flightsStatus}</p> : <p className="text-xs text-muted-foreground">{flightsStatus}</p>)}
        </div>
      )}

      {tab === "drive" && driveRoute && (
        <div className="space-y-6">
          <section className="rounded-2xl bg-card p-4 ring-1 ring-border" aria-label="Driving">
            <div className="flex items-center gap-3">
              <ModeTile mode="drive" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-medium tabular-nums tracking-[-0.012em]">{durationFromSeconds(driveRoute.durationSeconds)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">Drive · {distance(driveRoute.distanceMeters / 1000)}</p>
              </div>
              <button
                type="button"
                onClick={() => void saveChoice({ mode: "drive", minutes: Math.round(driveRoute.durationSeconds / 60), km: Math.round(driveRoute.distanceMeters / 100) / 10, name: `Drive, ${durationFromSeconds(driveRoute.durationSeconds)}` })}
                className="btn-chip"
              >
                Save to my trip
              </button>
            </div>
            {driveTraffic && (
              <div className="mt-4">
                <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
                  {driveTraffic.bar.map((run, i) => (
                    <span key={i} className="min-w-[3px]" style={{ flex: `${Math.max(run.km, 0.05)} 1 0`, background: run.color }} />
                  ))}
                </div>
                <p className={cn("mt-2.5 text-xs font-medium", driveTraffic.summary.tone === "caution" ? "text-caution" : driveTraffic.summary.tone === "good" ? "text-positive" : "text-ink-soft")}>
                  {driveTraffic.summary.text}
                  <span className="font-normal text-muted-foreground"> · live traffic along the route</span>
                </p>
              </div>
            )}
          </section>

          {(() => {
            const est = usdRate ? estimateRideshare(driveRoute.distanceMeters, driveRoute.durationSeconds, usdRate.currency, usdRate.rate) : estimateRideshare(driveRoute.distanceMeters, driveRoute.durationSeconds);
            const uberHref = `uber://?action=setPickup&pickup[formatted_address]=${encodeURIComponent(from)}&dropoff[formatted_address]=${encodeURIComponent(to)}`;
            const lyftHref = driveEnds
              ? `lyft://ridetype?id=lyft&pickup[latitude]=${driveEnds.from[1]}&pickup[longitude]=${driveEnds.from[0]}&destination[latitude]=${driveEnds.to[1]}&destination[longitude]=${driveEnds.to[0]}`
              : undefined;
            return (
              <section aria-label="Rideshare estimate">
                <h3 className="font-display text-lg font-medium tracking-[-0.006em]">Rideshare, roughly</h3>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-xl font-medium tabular-nums">{est.low}–{est.high} {est.currency}</span>
                  <span className="text-xs text-muted-foreground">~{formatDuration(est.minutes)}</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">An estimate from driving distance and time, not a live quote. Actual fares vary with demand.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={uberHref} target="_blank" rel="noreferrer noopener" className="btn-chip">
                    Open in Uber <ExternalLink className="size-3.5" />
                  </a>
                  {lyftHref && (
                    <a href={lyftHref} target="_blank" rel="noreferrer noopener" className="btn-chip">
                      Open in Lyft <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveChoice({ mode: "rideshare", provider: "uber/lyft", estimateLow: est.low, estimateHigh: est.high, currency: est.currency, name: "Rideshare (est.), Uber/Lyft" })}
                    className="btn-chip"
                  >
                    Save to my trip
                  </button>
                </div>
              </section>
            );
          })()}
        </div>
      )}

      {tab === "flight" && !flightsLoading && flights.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Sort and filter flights">
            {(["best", "cheapest", "fastest", "earliest"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className="btn-chip capitalize">
                {k}
              </button>
            ))}
            <button type="button" aria-pressed={nonstopOnly} onClick={() => setNonstopOnly((v) => !v)} className="btn-chip">
              Non-stop
            </button>
          </div>
          {when && !anyTime && onTime.length < flights.length && (
            <p className="text-xs text-muted-foreground">
              Showing flights {when.kind === "depart" ? "leaving after" : "landing by"} {when.time}.{" "}
              <button type="button" onClick={() => setAnyTime(true)} className={cn(textAction, "text-xs underline")}>
                Show all {flights.length}
              </button>
            </p>
          )}
          {shownFlights.length === 0 && <p className="rounded-2xl bg-surface px-4 py-5 text-sm leading-relaxed text-muted-foreground">No flights match those filters. Try another time, or turn off Non-stop.</p>}
        </div>
      )}

      {tab === "flight" && !flightsLoading && shownFlights.length > 0 && (
        <ul className="space-y-3">
          {shownFlights.map((f, i) => {
            const price = (() => {
              try {
                return new Intl.NumberFormat(undefined, { style: "currency", currency: f.priceCurrency }).format(Number(f.priceAmount));
              } catch {
                return `${f.priceAmount} ${f.priceCurrency}`;
              }
            })();
            const id = f.id || String(i);
            const open = openFlight === id;
            const when = (iso: string) => {
              const d = new Date(iso);
              return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            };
            const via = f.layoverAirports?.length ? ` via ${f.layoverAirports.join(", ")}` : "";
            return (
              <li key={id} className={cn("rounded-2xl bg-card transition-shadow duration-200", open ? "shadow-lift ring-[1.5px] ring-ink" : "ring-1 ring-border hover:ring-input")}>
                <button type="button" onClick={() => setOpenFlight(open ? null : id)} aria-expanded={open} className="block w-full rounded-2xl p-4 text-left">
                  <span className="flex items-center gap-3">
                    <AirlineMark offer={f} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-medium">{f.airline}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{formatDuration(f.durationMinutes)} · {f.stops === 0 ? "non-stop" : `${f.stops} stop${f.stops === 1 ? "" : "s"}${via}`}{f.returnLegs?.length || returnDate ? " · round-trip fare" : ""}</span>
                    </span>
                    <span className="font-display text-xl font-medium tabular-nums tracking-[-0.012em]">{price}</span>
                  </span>
                  {f.departAt && f.arriveAt && (
                    <span className="mt-3.5 flex items-center justify-between gap-3 text-sm tabular-nums">
                      <span>
                        <span className="font-semibold">{when(f.departAt)}</span>
                        {f.originAirport && <span className="ml-1.5 text-muted-foreground">{f.originAirport}</span>}
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-border" />
                      <span className="text-right">
                        <span className="font-semibold">{when(f.arriveAt)}</span>
                        {f.destinationAirport && <span className="ml-1.5 text-muted-foreground">{f.destinationAirport}</span>}
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} aria-hidden="true" />
                    </span>
                  )}
                </button>
                {open && <FlightDetails flight={f} travellers={travellers} />}
                <div className="flex gap-2 px-4 pb-4 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveChoice({ mode: "flight", airline: f.airline, minutes: f.durationMinutes, fare: `${f.priceAmount} ${f.priceCurrency}`, stops: f.stops, departAt: f.departAt, arriveAt: f.arriveAt, summary: `${f.airline}, ${price}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}` })}
                    className="btn-chip"
                  >
                    Save to my trip
                  </button>
                  <a href={googleFlightsUrl(f, returnDate)} target="_blank" rel="noopener noreferrer" className="btn-primary-sm">
                    View on Google Flights
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "transit" && routes.length > 0 && (
        <ul className="space-y-3" aria-label="Routes">
          {routes.map((route, i) => {
            const tag = routeTags[i];
            const open = selected === i;
            const dep = clock(route.departureTime, route.timeZone);
            const arr = clock(route.arrivalTime, route.timeZone);
            const fare = money(route.fare);
            const steps = mergeWalks(route.steps ?? []);
            const rides = steps.filter((st) => (st.mode ?? "") !== "walk");
            return (
              <li key={i} className={cn("rounded-2xl bg-card transition-shadow duration-200", open ? "shadow-lift ring-[1.5px] ring-ink" : "ring-1 ring-border hover:ring-input")}>
                <button type="button" onClick={() => choose(i)} aria-expanded={open} className="block w-full rounded-2xl p-4 text-left">
                  <span className="flex items-center justify-between gap-3">
                    {tag ? (
                      <span className={cn("status-chip", tag === "fastest" && "status-ok")}>{TAG_TEXT[tag]}</span>
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">{distance(route.distanceMeters / 1000)}</span>
                    )}
                    <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                      {dep && arr && <span>{dep} → {arr}</span>}
                      <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} aria-hidden="true" />
                    </span>
                  </span>
                  <span className="mt-2.5 flex items-baseline justify-between gap-3">
                    <span className="font-display text-[1.75rem] font-medium leading-none tabular-nums tracking-[-0.03em]">{durationFromSeconds(route.durationSeconds)}</span>
                    {fare && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">{fare}</span>}
                  </span>
                  {steps.length > 0 && <Ribbon icons className="mt-4" parts={steps.map((st) => ({ mode: (st.mode ?? "transit").toLowerCase(), minutes: (st.durationSeconds ?? 0) / 60 }))} />}
                  <span className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {rides.slice(0, 3).map((st, si) => (
                      <span key={si} className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span className="size-2 rounded-full" style={{ background: colorOf((st.mode ?? "transit").toLowerCase()) }} />
                        {st.line ?? st.vehicleName ?? MODE_LABEL[(st.mode ?? "").toLowerCase()] ?? st.mode}
                      </span>
                    ))}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {routeMeta[i].changes === 0 ? "No changes" : `${routeMeta[i].changes} change${routeMeta[i].changes === 1 ? "" : "s"}`} · {formatDuration(routeMeta[i].walkMinutes)} walking
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t border-border px-4 pb-4 pt-4">
                    {steps.length > 0 ? (
                      <ol>
                        {steps.map((step, si) => (
                          <StepRow key={si} step={step} last={si === steps.length - 1} />
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">No step-by-step breakdown was returned for this route.</p>
                    )}
                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                      {route.fare
                        ? "Buy this fare from the operator’s app or a station machine. A single ticket or day pass usually covers the whole trip."
                        : "Check the operator’s app or a station machine for the current fare and tickets."}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn-primary-sm"
                      >
                        Start in Google Maps <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    <button
                      type="button"
                      onClick={() =>
                        void saveChoice({
                          mode: rides[0]?.mode ?? "transit",
                          minutes: Math.round(route.durationSeconds / 60),
                          fare: route.fare ? `${route.fare.amount} ${route.fare.currency}` : null,
                          departAt: route.departureTime,
                          arriveAt: route.arrivalTime,
                          summary: describeRoutes(from, to, [route]).split("\n")[1] ?? "",
                        })
                      }
                      className="btn-chip"
                    >
                      Save to my trip
                    </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(routes.length > 0 || flights.length > 0 || driveRoute) && (
        <Link
          href={askAssistantHref(tripId, {
            name: `${from} → ${to}`,
            question: `Compare these ways to get from ${from} to ${to} — which is fastest, cheapest, and simplest, and what would you pick?`,
            context: [
              `Travelling ${whenLabel(when).toLowerCase()}${returnDate ? `, returning ${returnDate}` : ""}, ${travellers} traveller${travellers === 1 ? "" : "s"}.`,
              routes.length > 0 ? describeRoutes(from, to, routes) : "",
              driveRoute ? `Driving: ${durationFromSeconds(driveRoute.durationSeconds)}, ${(driveRoute.distanceMeters / 1000).toFixed(1)} km.` : "",
              flights.length > 0
                ? `Flights from ${from} to ${to}:\n` + flights.map((f, i) => `Option ${i + 1}: ${f.airline}, ${f.priceAmount} ${f.priceCurrency}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}`).join("\n")
                : "",
            ].filter(Boolean).join("\n\n"),
          })}
          className="btn-secondary w-full"
        >
          Ask Roam to compare these
        </Link>
      )}

    </div>
  );
}
