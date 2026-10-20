import { useEffect, useRef, useState } from "react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { notifyToast } from "@/lib/application/toast";
import { greatCircleArc, haversineKm } from "@/lib/application/geo";
import { congestionRuns, interchangeNodes, type MapOverlay } from "@/lib/application/route-overlay";
import { departAtParam, type Sort, type When } from "@/lib/application/travel-time";
import { resolveCurrency } from "@/lib/currency";
import { durationFromSeconds } from "@/lib/utils";
import { flightsStatusText, legsFor, mergeWalks, pathOf, transitStatusText, fastestIndex, type DriveRoute, type Flight, type MapLegShape, type Route } from "../domain/route-view";

/** What the AI search bar (or a caller) can push in to run a search without the user retyping. */
export type TransportPreset = { from?: string; to?: string; modes?: string[]; nonce: number };

/**
 * The "Find your way there" search: the two ends, when and who, and the three searches it runs together (public transit, driving,
 * flights when the places are far apart), with what each found and the tab that is open. A newer search replaces an older one; changing
 * the day, time or travellers repeats the search on the same tab; whichever tab is open is what the map shows.
 */
export function useTransportSearch({ tripId, preset, onRoute }: {
  tripId: string;
  preset?: TransportPreset;
  /** Called with the map legs for the chosen route (or null when cleared). */
  onRoute?: (legs: MapLegShape[] | null, overlay?: MapOverlay) => void;
}) {
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
      setFlightsStatus(flightsStatusText({ ok: res.ok, count: offers.length, assumedDate: Boolean(body.assumedDate), travellers }));
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
          setTransitStatus(transitStatusText({ ok: response.ok, count: found.length, when, timeIgnored: Boolean(body.timeIgnored) }));
          if (response.ok && found.length) setSelected(fastestIndex(found));
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

  return {
    from, setFrom, to, setTo, routes, flights, driveRoute, driveEnds, selected, status, tab, setTab, transitStatus, usdRate, driveStatus, flightsStatus, flightsLoading,
    loadFlights, trip, when, setWhen, returnDate, setReturnDate, travellers, setTravellers, sort, setSort, nonstopOnly, setNonstopOnly, anyTime, setAnyTime,
    openFlight, setOpenFlight, timeNote, searched, loading, toRef, queryRef, search, choose, saveChoice,
  };
}
