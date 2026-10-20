"use client";

import { ArrowUpRight, Expand } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { Skeleton } from "@/components/Skeleton";
import { LazyTripMap } from "./LazyTripMap";
import { mapOfHops, minutes } from "./routeMap";
import { useHops } from "./useHops";
import { ModeTile, mainMode } from "@/features/maps/ui/modeParts";
import { MODE_LABEL, STOP_CORAL } from "@/lib/application/mode-visuals";
import { BigFigure, PanelHeader } from "./PanelHeader";
import { useSettled } from "./useSettled";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useTripPanelMaybe, type MapPoint, type PanelState } from "@/components/TripPanelProvider";
import type { MapLeg, MapPin } from "@/components/TripMap";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { Notice, surface, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { fetchPlaceDetails } from "@/features/places/application/placeDetailsCache";

type Coords = { lat: number; lng: number } | null;
const lookups = new Map<string, Promise<Coords>>();

const coordsOf = (place: { location?: { latitude?: number; longitude?: number } } | null | undefined): Coords =>
  typeof place?.location?.latitude === "number" && typeof place.location.longitude === "number" ? { lat: place.location.latitude, lng: place.location.longitude } : null;

/** A place's coordinates: from the details the place panel already cached, else one request shared by every caller. */
function lookUp(tripId: string, placeId: string): Promise<Coords> {
  const key = `${tripId}:${placeId}`;
  const known = lookups.get(key);
  if (known) return known;
  const request = fetchPlaceDetails(tripId, placeId).then((body) => coordsOf(body?.place));
  lookups.set(key, request);
  return request;
}

/** The points with coordinates, looking up the ones known only by place id. `pending` is true until every lookup has answered. */
function useLocated(tripId: string, points: MapPoint[]) {
  const [found, setFound] = useState<Record<string, Coords>>({});
  const missing = useMemo(() => points.filter((p) => (p.lat == null || p.lng == null) && p.placeId), [points]);
  const [pending, setPending] = useState(missing.length > 0);
  useEffect(() => {
    if (missing.length === 0) return setPending(false);
    let current = true;
    setPending(true);
    Promise.all(missing.map(async (p) => [p.id, await lookUp(tripId, p.placeId!)] as const)).then((pairs) => {
      if (!current) return;
      setFound(Object.fromEntries(pairs));
      setPending(false);
    });
    return () => {
      current = false;
    };
  }, [tripId, missing]);
  const located = points.flatMap((p) => {
    const at = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : found[p.id];
    return at ? [{ ...p, ...at }] : [];
  });
  return { located, pending };
}

const DOT: Record<MapPoint["kind"], string> = { stay: "bg-cat-stay", eat: "bg-cat-eat", see: "bg-cat-see", do: "bg-cat-do", event: "bg-cat-event", saved: "bg-cat-saved" };

/** Places, a day or a route on the map, with the stops listed underneath in the same order as the pins. */
export function MapDetail({ tripId, panel }: { tripId: string; panel: Extract<PanelState, { kind: "map" }> }) {
  const ctx = useTripPanelMaybe();
  const reduce = useReducedMotion();
  const settled = useSettled();
  const { located, pending } = useLocated(tripId, panel.points);
  const days = useMemo(() => [...new Set(located.map((p) => p.day).filter((d): d is number => d !== undefined))].sort((a, b) => a - b), [located]);
  const [active, setActive] = useState<number | "all">("all");
  const shown = located.filter((p) => active === "all" || p.day === active).sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  const unplaced = panel.points.filter((p) => active === "all" || p.day === active).length - shown.length;
  const pins: MapPin[] = located.map((p) => ({ id: p.id, name: p.name, lng: p.lng, lat: p.lat, kind: p.kind, day: p.day }));
  const pathLegs: MapLeg[] | undefined = panel.path ? [{ polyline: panel.path, mode: panel.mode ?? "transit" }] : undefined;
  // A straight line across different days says nothing, so it is drawn only for one day (or a route).
  const connect = panel.connect !== false && (days.length < 2 || active !== "all");

  // Real ways between the stops (walk, ride, change) when it is one day or one route, not a straight line across the city.
  const hopStops = connect && !panel.path && shown.length >= 2 && shown.length <= 10 ? shown.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })) : null;
  const hops = useHops(tripId, hopStops);
  const real = useMemo(() => (hops ? mapOfHops(hops) : null), [hops]);
  // The full map shows the saved itinerary, so link to it only for a day whose stops are all saved.
  const saved = (useTripDataMaybe()?.data?.itinerary ?? []) as Array<{ title: string; day_index: number }>;
  const savedDay = active !== "all" && shown.length > 0 && shown.every((p) => saved.some((i) => i.day_index === active && i.title.trim().toLowerCase() === p.name.trim().toLowerCase())) ? active : null;

  if (pending) return <div className="space-y-4 p-4"><Skeleton className="h-[46vh] min-h-[280px]" /><span className="sr-only" role="status">Finding these on the map</span></div>;

  return (
    <div className="space-y-4 p-4 pb-8">
      {days.length > 1 && (
        <SlidingTabs
          label="Show day"
          className="w-fit max-w-full overflow-x-auto"
          tabClassName="px-3"
          value={active}
          onChange={setActive}
          items={(["all", ...days] as const).map((d) => ({ key: d, content: <span className="text-sm">{d === "all" ? "All days" : `Day ${d}`}</span> }))}
        />
      )}
      {shown.length > 0 && (
        <PanelHeader eyebrow={["On the map", ...(active === "all" ? (days.length > 1 ? ["All days"] : []) : [`Day ${active}`])]}>
          <BigFigure text={`${shown.length} ${shown.length === 1 ? "stop" : "stops"}`} />
        </PanelHeader>
      )}
      {located.length === 0 ? (
        <Notice>None of these have a location Roam can put on a map yet.</Notice>
      ) : !settled ? (
        <Skeleton className="h-[46vh] min-h-[280px]" />
      ) : (
        <LazyTripMap className="h-[46vh] min-h-[280px]" pins={pins} legs={real?.legs.length ? real.legs : pathLegs} overlay={real?.overlay} fitControl scaleBar activeDay={active} connect={connect} />
      )}
      {savedDay !== null && (
        <a href={`/trips/${tripId}/map?day=${savedDay}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium transition-[background-color,transform] hover:bg-accent/40 active:scale-[0.985]">
          <Expand className="size-4" aria-hidden /> Open Day {savedDay} on the full map
        </a>
      )}
      {unplaced > 0 && located.length > 0 && <Notice>{unplaced} stop{unplaced === 1 ? " has" : "s have"} no location, so {unplaced === 1 ? "it isn’t" : "they aren’t"} on the map.</Notice>}
      {shown.length > 0 && (
        <ol className={cn(surface, "divide-y divide-border overflow-hidden")}>
          {shown.map((p, i) => {
            const hop = hops && hops.length === shown.length - 1 ? hops[i] : undefined;
            const open = p.placeId && ctx ? () => ctx.openPanel({ kind: "place", placeId: p.placeId!, name: p.name }) : null;
            const row = (
              <>
                <span aria-hidden style={p.day != null ? { background: STOP_CORAL } : undefined} className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-white tabular-nums", p.day == null && DOT[p.kind])}>{i + 1}</span>
                <span className={cn(type.body, "min-w-0 flex-1 font-medium")}>{p.name}</span>
                {active === "all" && days.length > 1 && p.day && <span className={type.meta}>Day {p.day}</span>}
                {open && <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              </>
            );
            return (
              <motion.li key={p.id} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...motionTokens.swap, delay: 0.1 + Math.min(i, 8) * 0.04 }}>
                {open ? (
                  <button type="button" onClick={open} className="flex min-h-12 w-full items-center gap-3 px-4 text-left transition-colors hover:bg-accent/40">{row}</button>
                ) : (
                  <div className="flex min-h-12 items-center gap-3 px-4">{row}</div>
                )}
                {hop && (
                  <p className={cn(type.meta, "flex items-center gap-2 border-t border-dashed border-border bg-muted/40 py-2 pl-[2.75rem] pr-4 tabular-nums")}>
                    <ModeTile mode={mainMode({ mode: hop.mode, steps: hop.steps })} size="sm" />
                    {hop.minutes ? minutes(hop.minutes * 60) : "Intercity"}
                    <span aria-hidden>·</span>
                    {MODE_LABEL[mainMode({ mode: hop.mode, steps: hop.steps })] ?? "Transit"}
                    {hop.fare ? <><span aria-hidden>·</span>{new Intl.NumberFormat(undefined, { style: "currency", currency: hop.fare.currency }).format(hop.fare.amount)}</> : null}
                  </p>
                )}
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
