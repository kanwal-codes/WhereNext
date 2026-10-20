"use client";

import { type ReactNode } from "react";
import { useDistance } from "@/components/use-distance";
import Link from "next/link";
import { ArrowDownUp, Car, ChevronDown, ExternalLink, Loader2, Plane, Search, TrainFront } from "lucide-react";
import type { MapLeg } from "@/components/TripMap";
import { type MapOverlay, type RouteTag } from "@/lib/application/route-overlay";
import { askAssistantHref } from "@/lib/places-ui";
import { estimateRideshare } from "@/lib/application/rideshare-estimate";
import { cn, durationFromSeconds, formatDuration } from "@/lib/utils";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { useTransportSearch, type TransportPreset } from "../application/useTransportSearch";
import { TripOptions } from "./TripOptions";
import { cheapestFlight, clock, compareContext, driveSaveValue, driveTrafficOf, flightClock, flightPrice, flightSaveValue, googleFlightsUrl, googleMapsTransitUrl, hexColor, lyftHref, mergeWalks, money, routeSummaries, stopsLabel, transitSaveValue, uberHref, type Step } from "../domain/route-view";
import { FlightDetails } from "./FlightDetails";
import { AirlineMark } from "@/features/conversation/ui/panels/OtherFlights";
import { arrangeFlights, fitsTime, todayLocal, whenLabel } from "@/lib/application/travel-time";
import { MODE_LABEL } from "@/lib/application/mode-visuals";
import { ModeTile, Ribbon, colorOf, railStyle } from "@/features/maps/ui/modeParts";

const TAG_TEXT: Record<RouteTag, string> = { fastest: "Fastest", "fewer-changes": "Fewer changes", "least-walking": "Least walking" };

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
  const {
    from, setFrom, to, setTo, routes, flights, driveRoute, driveEnds, selected, status, tab, setTab, transitStatus, usdRate, driveStatus, flightsStatus, flightsLoading,
    loadFlights, trip, when, setWhen, returnDate, setReturnDate, travellers, setTravellers, sort, setSort, nonstopOnly, setNonstopOnly, anyTime, setAnyTime,
    openFlight, setOpenFlight, timeNote, searched, loading, toRef, queryRef, search, choose, saveChoice,
  } = useTransportSearch({ tripId, preset, onRoute });
  const { meta: routeMeta, tags: routeTags } = routeSummaries(routes);
  const { traffic: driveTraffic } = driveTrafficOf(driveRoute);
  const transitTime = routes.length ? durationFromSeconds(Math.min(...routes.map((r) => r.durationSeconds))) : "";
  const cheapest = cheapestFlight(flights);
  const flightFrom = cheapest?.from ?? null;
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
                onClick={() => void saveChoice(driveSaveValue(driveRoute))}
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
            const uber = uberHref(from, to);
            const lyft = driveEnds ? lyftHref(driveEnds) : undefined;
            return (
              <section aria-label="Rideshare estimate">
                <h3 className="font-display text-lg font-medium tracking-[-0.006em]">Rideshare, roughly</h3>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-xl font-medium tabular-nums">{est.low}–{est.high} {est.currency}</span>
                  <span className="text-xs text-muted-foreground">~{formatDuration(est.minutes)}</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">An estimate from driving distance and time, not a live quote. Actual fares vary with demand.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={uber} target="_blank" rel="noreferrer noopener" className="btn-chip">
                    Open in Uber <ExternalLink className="size-3.5" />
                  </a>
                  {lyft && (
                    <a href={lyft} target="_blank" rel="noreferrer noopener" className="btn-chip">
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
            const price = flightPrice(f);
            const id = f.id || String(i);
            const open = openFlight === id;
            const via = f.layoverAirports?.length ? ` via ${f.layoverAirports.join(", ")}` : "";
            return (
              <li key={id} className={cn("rounded-2xl bg-card transition-shadow duration-200", open ? "shadow-lift ring-[1.5px] ring-ink" : "ring-1 ring-border hover:ring-input")}>
                <button type="button" onClick={() => setOpenFlight(open ? null : id)} aria-expanded={open} className="block w-full rounded-2xl p-4 text-left">
                  <span className="flex items-center gap-3">
                    <AirlineMark offer={f} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-medium">{f.airline}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{formatDuration(f.durationMinutes)} · {f.stops === 0 ? "non-stop" : `${stopsLabel(f.stops)}${via}`}{f.returnLegs?.length || returnDate ? " · round-trip fare" : ""}</span>
                    </span>
                    <span className="font-display text-xl font-medium tabular-nums tracking-[-0.012em]">{price}</span>
                  </span>
                  {f.departAt && f.arriveAt && (
                    <span className="mt-3.5 flex items-center justify-between gap-3 text-sm tabular-nums">
                      <span>
                        <span className="font-semibold">{flightClock(f.departAt)}</span>
                        {f.originAirport && <span className="ml-1.5 text-muted-foreground">{f.originAirport}</span>}
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-border" />
                      <span className="text-right">
                        <span className="font-semibold">{flightClock(f.arriveAt)}</span>
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
                    onClick={() => void saveChoice(flightSaveValue(f, price))}
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
                    <span className="font-display text-title font-medium leading-none tabular-nums tracking-[-0.03em]">{durationFromSeconds(route.durationSeconds)}</span>
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
                        href={googleMapsTransitUrl(from, to)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn-primary-sm"
                      >
                        Start in Google Maps <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    <button
                      type="button"
                      onClick={() => void saveChoice(transitSaveValue(route, from, to))}
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
            context: compareContext({ from, to, when, returnDate, travellers, routes, driveRoute, flights }),
          })}
          className="btn-secondary w-full"
        >
          Ask Roam to compare these
        </Link>
      )}

    </div>
  );
}
