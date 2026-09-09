"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Car, ChevronDown, ExternalLink, Footprints, Loader2, Plane, Search } from "lucide-react";
import type { MapLeg } from "@/components/TripMap";
import { askAssistantHref } from "@/lib/places-ui";
import { notifyToast } from "@/lib/application/toast";
import { estimateRideshare } from "@/lib/application/rideshare-estimate";
import { greatCircleArc } from "@/lib/application/geo";
import { cn, durationFromSeconds, formatDuration } from "@/lib/utils";
import { BookingSheet } from "@/features/bookings/ui/BookingSheet";

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
  arrivalTime?: string;
  fare?: { amount: number; currency: string };
  polyline?: Array<[number, number]>;
};
export type Flight = { id: string; airline: string; priceAmount: string; priceCurrency: string; durationMinutes: number; stops: number; departAt: string; arriveAt: string; passengerIds: string[]; originAirport?: string; destinationAirport?: string; fareConditions?: string[] };
type DriveRoute = { distanceMeters: number; durationSeconds: number; geometry: { coordinates: Array<[number, number]> } };

/** What the AI search bar (or a caller) can push in to run a search without the user retyping. */
export type TransportPreset = { from?: string; to?: string; modes?: string[]; nonce: number };

const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null);
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

/** A one-line summary of every route, handed to the assistant as on-screen context. */
function describeRoutes(from: string, to: string, routes: Route[]): string {
  const lines = routes.map((r, i) => {
    const ride = (r.steps ?? [])
      .filter((s) => (s.mode ?? "") !== "walk")
      .map((s) => `${s.line ?? s.vehicleName ?? s.mode}${s.headsign ? ` toward ${s.headsign}` : ""}${s.stopCount ? ` (${s.stopCount} stops)` : ""}${s.agency ? ` — ${s.agency}` : ""}`)
      .join("; ");
    const dep = clock(r.departureTime);
    const arr = clock(r.arrivalTime);
    return `Option ${i + 1}: ${durationFromSeconds(r.durationSeconds)}, ${(r.distanceMeters / 1000).toFixed(1)} km${dep && arr ? `, leave ${dep} arrive ${arr}` : ""}${money(r.fare) ? `, fare ${money(r.fare)}` : ""}${ride ? ` — ${ride}` : ""}`;
  });
  return `Ways to get from ${from} to ${to}:\n${lines.join("\n")}`;
}

function StepLine({ step }: { step: Step }) {
  if ((step.mode ?? "").toUpperCase().includes("WALK")) {
    return (
      <li className="flex items-center gap-2 text-ink-soft">
        <Footprints className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        Walk {durationFromSeconds(step.durationSeconds ?? 0)}{step.arrivalStop ? ` to ${step.arrivalStop}` : ""}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 text-ink-soft">
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
        style={{ background: step.color ? `#${step.color.replace(/^#/, "")}` : "var(--color-coral, #e2603f)" }}
      />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{step.line ?? step.vehicleName ?? "Transit"}</span>
        {step.headsign ? ` toward ${step.headsign}` : ""}
        {step.agency ? <span className="text-muted-foreground"> · {step.agency}</span> : null}
        <span className="block text-xs text-muted-foreground">
          {step.departureStop ?? "—"} → {step.arrivalStop ?? "—"}
          {step.stopCount ? ` · ${step.stopCount} stops` : ""} · {durationFromSeconds(step.durationSeconds ?? 0)}
        </span>
      </span>
    </li>
  );
}

export function TransportSurface({
  tripId,
  preset,
  onRoute,
  searchSlot,
}: {
  tripId: string;
  /** A search pushed in from outside (e.g. the AI bar). Bump `nonce` to run it. */
  preset?: TransportPreset;
  /** Called with the map legs for the chosen route (or null when cleared). */
  onRoute?: (legs: MapLeg[] | null) => void;
  /** An alternative way to fill in From/To (e.g. a natural-language ask bar), shown above the form in the same card. */
  searchSlot?: ReactNode;
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
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const modesRef = useRef<string[]>([]);
  const [bookingOffer, setBookingOffer] = useState<Flight | null>(null);

  function choose(i: number) {
    const next = selected === i ? null : i;
    setSelected(next);
    onRoute?.(next == null ? null : legsFor(routes[i]));
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

  async function search(over?: { from?: string; to?: string; modes?: string[] }) {
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
    setLoading(true);
    setStatus("");
    setSelected(null);
    setRoutes([]);
    setFlights([]);
    setDriveRoute(null);
    setDriveEnds(null);
    onRoute?.(null);

    const modes = modesRef.current;
    const wantFlights = modes.includes("flight");
    const wantDrive = !wantFlights && modes.includes("drive");
    try {
      if (wantDrive) {
        const [oCoord, dCoord] = await Promise.all([geocode(a, request.signal), geocode(b, request.signal)]);
        if (!oCoord || !dCoord) {
          setStatus("Couldn’t find one of those places.");
          setSearched(true);
          return;
        }
        const res = await fetch(`/api/trips/${tripId}/directions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ origin: oCoord, destination: dCoord, profile: "driving" }),
          signal: request.signal,
        });
        const body = await res.json();
        const route = res.ok ? (body.route as DriveRoute | undefined) ?? null : null;
        setDriveRoute(route);
        setDriveEnds(route ? { from: oCoord, to: dCoord } : null);
        setSearched(true);
        setStatus(!res.ok ? "We couldn’t load a driving route just now. Try again in a moment." : !route ? "No driving route found between those two places." : "");
        if (route) onRoute?.([{ polyline: route.geometry.coordinates, mode: "drive" }]);
        return;
      }

      if (wantFlights) {
        const [res, ends] = await Promise.all([
          fetch(`/api/trips/${tripId}/flights`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ from: a, to: b }),
            signal: request.signal,
          }),
          Promise.all([geocode(a, request.signal), geocode(b, request.signal)]),
        ]);
        const body = await res.json();
        const offers = (body.offers ?? []) as Flight[];
        setFlights(offers);
        setSearched(true);
        setStatus(
          !res.ok
            ? "We couldn’t load flights just now. Try again in a moment."
            : offers.length === 0
              ? "No flights came back for those two places."
              : `${offers.length} flight${offers.length === 1 ? "" : "s"}${body.assumedDate ? " · example date — add your trip dates for accurate prices" : ""}`,
        );
        if (ends[0] && ends[1]) onRoute?.([{ polyline: greatCircleArc(ends[0], ends[1]), mode: "flight" }]);
        return;
      }

      const response = await fetch(`/api/trips/${tripId}/transit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: a, destination: b }),
        signal: request.signal,
      });
      const body = await response.json();
      const found = (body.routes ?? []) as Route[];
      setRoutes(found);
      setSearched(true);
      setStatus(
        !response.ok
          ? "We couldn’t load routes just now. Try again in a moment."
          : found.length === 0
            ? ""
            : `${found.length} route${found.length === 1 ? "" : "s"}`,
      );
      if (response.ok && found.length) {
        setSelected(0);
        onRoute?.(legsFor(found[0]));
      }
    } catch (error) {
      setRoutes([]);
      setFlights([]);
      setDriveRoute(null);
      setDriveEnds(null);
      if (error instanceof DOMException && error.name === "AbortError") setStatus("Search cancelled.");
      else setStatus(wantDrive ? "We couldn’t load a driving route just now. Try again in a moment." : wantFlights ? "We couldn’t load flights just now. Try again in a moment." : "We couldn’t load routes just now. Try again in a moment.");
    } finally {
      setLoading(false);
      if (controller.current === request) controller.current = null;
    }
  }

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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        {searchSlot && <div className="mb-4">{searchSlot}</div>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search({ modes: [] });
          }}
        >
          <p className="eyebrow">Getting from A to B</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              From
              <input value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" placeholder="Station, address or place" />
            </label>
            <label className="block text-sm font-medium">
              To
              <input value={to} onChange={(e) => setTo(e.target.value)} className="input-field" placeholder="Station, address or place" />
            </label>
          </div>
          <button type="submit" disabled={loading} className="btn-primary mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
          {status && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              {status}
            </p>
          )}
        </form>
      </div>

      {searched && !loading && routes.length === 0 && flights.length === 0 && !driveRoute && !status && (
        <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Nothing came back for that pair. Try nearby stations, or ask Roam for other options.
        </div>
      )}

      {driveRoute && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-display text-lg">
                <Car className="h-4 w-4 text-coral" /> Drive
              </span>
              <span className="text-sm font-semibold tabular-nums">{durationFromSeconds(driveRoute.durationSeconds)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{(driveRoute.distanceMeters / 1000).toFixed(1)} km</span>
            </div>
            <button
              type="button"
              onClick={() => void saveChoice({ mode: "drive", minutes: Math.round(driveRoute.durationSeconds / 60), km: Math.round(driveRoute.distanceMeters / 100) / 10, name: `Drive, ${durationFromSeconds(driveRoute.durationSeconds)}` })}
              className="btn-secondary mt-3"
            >
              Save to my trip
            </button>
          </div>

          {(() => {
            const est = estimateRideshare(driveRoute.distanceMeters, driveRoute.durationSeconds);
            const uberHref = `uber://?action=setPickup&pickup[formatted_address]=${encodeURIComponent(from)}&dropoff[formatted_address]=${encodeURIComponent(to)}`;
            const lyftHref = driveEnds
              ? `lyft://ridetype?id=lyft&pickup[latitude]=${driveEnds.from[1]}&pickup[longitude]=${driveEnds.from[0]}&destination[latitude]=${driveEnds.to[1]}&destination[longitude]=${driveEnds.to[0]}`
              : undefined;
            return (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="eyebrow">Rideshare (est.)</p>
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-lg tabular-nums">
                    {est.low}–{est.high} {est.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">~{est.minutes} min</span>
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">A rough estimate from driving distance and time — not a live quote. Actual fares vary with demand.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={uberHref} target="_blank" rel="noreferrer noopener" className="btn-secondary">
                    Open in Uber <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  {lyftHref && (
                    <a href={lyftHref} target="_blank" rel="noreferrer noopener" className="btn-secondary">
                      Open in Lyft <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveChoice({ mode: "rideshare", provider: "uber/lyft", estimateLow: est.low, estimateHigh: est.high, currency: est.currency, name: "Rideshare (est.), Uber/Lyft" })}
                    className="btn-secondary"
                  >
                    Save to my trip
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {flights.map((f, i) => {
        const price = (() => {
          try {
            return new Intl.NumberFormat(undefined, { style: "currency", currency: f.priceCurrency }).format(Number(f.priceAmount));
          } catch {
            return `${f.priceAmount} ${f.priceCurrency}`;
          }
        })();
        return (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 font-display text-lg">
                <Plane className="h-4 w-4 text-coral" /> {f.airline}
              </span>
              <span className="text-sm font-semibold tabular-nums">{price}</span>
              <span className="text-xs text-muted-foreground">{formatDuration(f.durationMinutes)}</span>
              <span className="text-xs text-muted-foreground">{f.stops === 0 ? "non-stop" : `${f.stops} stop${f.stops === 1 ? "" : "s"}`}</span>
            </div>
            {f.departAt && f.arriveAt && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {new Date(f.departAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {" → "}
                {new Date(f.arriveAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Fares and seats change fast — book on the airline’s site or a travel agent.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void saveChoice({ mode: "flight", airline: f.airline, minutes: f.durationMinutes, fare: `${f.priceAmount} ${f.priceCurrency}`, stops: f.stops, departAt: f.departAt, arriveAt: f.arriveAt, summary: `${f.airline}, ${price}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}` })}
                className="btn-secondary"
              >
                Save to my trip
              </button>
              <button type="button" onClick={() => setBookingOffer(f)} className="btn-primary">
                Book
              </button>
            </div>
          </div>
        );
      })}

      {routes.map((route, i) => {
        const open = selected === i;
        const dep = clock(route.departureTime);
        const arr = clock(route.arrivalTime);
        const fare = money(route.fare);
        return (
          <div key={i} className={cn("rounded-2xl border bg-card shadow-soft transition-colors", open ? "border-primary" : "border-border")}>
            <button type="button" onClick={() => choose(i)} className="flex w-full items-start justify-between gap-3 p-5 text-left">
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-lg tabular-nums">{durationFromSeconds(route.durationSeconds)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{(route.distanceMeters / 1000).toFixed(1)} km</span>
                  {dep && arr && (
                    <span className="text-xs text-muted-foreground">
                      {dep} → {arr}
                    </span>
                  )}
                  {fare && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{fare}</span>}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {(route.steps ?? [])
                    .filter((s) => (s.mode ?? "") !== "walk")
                    .map((s, si) => (
                      <span key={si} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: s.color ? `#${s.color.replace(/^#/, "")}` : "var(--color-coral, #e2603f)" }}
                        />
                        {s.line ?? s.vehicleName ?? s.mode}
                      </span>
                    ))}
                </span>
              </span>
              <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>

            {open && (
              <div className="border-t border-border px-5 py-4">
                {route.steps && route.steps.length > 0 ? (
                  <ol className="space-y-2.5 text-sm">
                    {route.steps.map((step, si) => (
                      <StepLine key={si} step={step} />
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No step-by-step breakdown was returned for this route.</p>
                )}
                <dl className="mt-4 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  {fare && (
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted-foreground">Fare</dt>
                      <dd className="font-medium">{fare}</dd>
                    </div>
                  )}
                  {dep && (
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted-foreground">Leave by</dt>
                      <dd className="font-medium">{dep}</dd>
                    </div>
                  )}
                  {arr && (
                    <div className="flex justify-between gap-2 sm:block">
                      <dt className="text-muted-foreground">Arrive</dt>
                      <dd className="font-medium">{arr}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {route.fare
                    ? "Buy this fare from the operator’s app or a station machine — a single ticket or day pass usually covers the whole trip."
                    : "Check the operator’s app or a station machine for the current fare and tickets."}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void saveChoice({
                      mode: (route.steps ?? []).find((s) => (s.mode ?? "") !== "walk")?.mode ?? "transit",
                      minutes: Math.round(route.durationSeconds / 60),
                      fare: route.fare ? `${route.fare.amount} ${route.fare.currency}` : null,
                      departAt: route.departureTime,
                      arriveAt: route.arrivalTime,
                      summary: describeRoutes(from, to, [route]).split("\n")[1] ?? "",
                    })
                  }
                  className="btn-secondary mt-3"
                >
                  Save to my trip
                </button>
              </div>
            )}
          </div>
        );
      })}

      {(routes.length > 0 || flights.length > 0) && (
        <Link
          href={askAssistantHref(tripId, {
            name: `${from} → ${to}`,
            question: `Compare these ways to get from ${from} to ${to} — which is fastest, cheapest, and simplest, and what would you pick?`,
            context:
              flights.length > 0
                ? `Flights from ${from} to ${to}:\n` +
                  flights
                    .map((f, i) => `Option ${i + 1}: ${f.airline}, ${f.priceAmount} ${f.priceCurrency}, ${formatDuration(f.durationMinutes)}, ${f.stops === 0 ? "non-stop" : `${f.stops} stop(s)`}`)
                    .join("\n")
                : describeRoutes(from, to, routes),
          })}
          className="btn-secondary"
        >
          Ask Roam to compare these
        </Link>
      )}

      <BookingSheet subject={bookingOffer ? { kind: "flight", tripId, offer: bookingOffer } : null} onClose={() => setBookingOffer(null)} />
    </div>
  );
}
