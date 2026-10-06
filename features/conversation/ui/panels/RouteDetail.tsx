"use client";

import React, { useState } from "react";
import { useDistance } from "@/lib/use-distance";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Car, Expand, PersonStanding, TrainFront } from "lucide-react";
import type { RouteBlock } from "@/components/TripPanelProvider";
import { pointsFromRoute } from "@/features/conversation/ui/blocks/mapPoints";
import { PlanStops, type PlanStop } from "@/features/conversation/ui/blocks/PlanStops";
import { parseRouteStep, routeLines, splitRouteEnds } from "@/features/conversation/ui/blocks/routeText";
import { Skeleton } from "@/components/Skeleton";
import { ContentSwap, motionTokens } from "@/components/motion-primitives";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { Badge, Notice, money, surface, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { LazyTripMap } from "./LazyTripMap";
import { fullMapHref, legsOfRoute, metricsOf, minutes, overlayOfRoutes, tagsOf } from "./routeMap";
import type { RouteTag } from "@/lib/application/route-overlay";
import { useSettled } from "./useSettled";

const MODE = {
  driving: { label: "Drive", icon: Car, travelmode: "driving" },
  walking: { label: "Walk", icon: PersonStanding, travelmode: "walking" },
  transit: { label: "Transit", icon: TrainFront, travelmode: "transit" },
} as const;
const modeOf = (route: RouteBlock) => MODE[route.mode as keyof typeof MODE] ?? MODE.transit;

const TAG_TEXT: Record<RouteTag, string> = { fastest: "Fastest", "fewer-changes": "Fewer changes", "least-walking": "Least walking" };
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null);

/** One way to travel: its headline (lines, time, fare), and, when chosen, its steps right underneath. */
function OptionCard({ route, index, single, tag, on, onSelect }: { route: RouteBlock; index: number; single: boolean; tag: RouteTag | null; on: boolean; onSelect: () => void }) {
  const distance = useDistance();
  const stops: PlanStop[] = route.steps.map((step) => {
    const parsed = parseRouteStep(step);
    return { title: parsed.title, glyph: parsed.glyph, trailing: parsed.duration };
  });
  const when = clock(route.departureTime) && clock(route.arrivalTime) ? `${clock(route.departureTime)} – ${clock(route.arrivalTime)}` : null;
  const metrics = metricsOf(route);
  const effort = metrics && route.mode === "transit" && route.legs?.some((l) => l.mode !== "walk") ?[`${metrics.changes === 0 ? "No" : metrics.changes} change${metrics.changes === 1 ? "" : "s"}`, metrics.walkMinutes > 0 ? `${metrics.walkMinutes} min walking` : null].filter(Boolean).join(", ") : null;
  const meta = [distance(route.distanceMeters / 1000), when, route.fare ? money(route.fare.amount, route.fare.currency) : null, effort].filter(Boolean).join(" · ");
  const head = (
    <>
      {!single && (
        <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{index + 1}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn(type.body, "flex flex-wrap items-center gap-1.5 font-medium")}>
          {route.mode === "transit" ? routeLines(route.steps) : MODE[route.mode as keyof typeof MODE]?.label ?? route.mode}
          {!single && (tag ? <Badge tone={tag === "fastest" ? "positive" : "neutral"}>{TAG_TEXT[tag]}</Badge> : index === 0 && <Badge tone="positive">Quickest</Badge>)}
        </span>
        <span className={cn(type.meta, "block truncate tabular-nums")}>{meta}</span>
      </span>
      <span className={cn("shrink-0 text-right font-display text-lg font-semibold tabular-nums leading-none", on && "text-foreground")}>{minutes(route.durationSeconds)}</span>
    </>
  );
  const reduce = useReducedMotion();
  return (
    <motion.div layout="position" transition={motionTokens.standard} className={cn(surface, "overflow-hidden transition-colors", on && !single && "border-primary")}>
      {single ? (
        <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">{head}</div>
      ) : (
        <button type="button" role="radio" aria-checked={on} onClick={onSelect} className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors", on ? "bg-accent/50" : "hover:bg-accent/30")}>
          {head}
        </button>
      )}
      <AnimatePresence initial={false}>
        {on && stops.length > 0 && (
          <motion.div
            key="steps"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={motionTokens.swap}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-4">
              <PlanStops stops={stops} variant="card" stagger />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MODE_ORDER: Array<keyof typeof MODE> = ["driving", "transit", "walking"];

/** Every way Roam found between two places, organised by how you travel (drive, transit, walk); under transit, its alternatives; then the chosen one with its steps, its line on a map, and a live-times link. */
export function RouteDetail({ tripId, routes, active: initial }: { tripId: string; routes: RouteBlock[]; active: number }) {
  const groups = MODE_ORDER.map((mode) => ({ mode, options: routes.filter((r) => r.mode === mode).sort((a, b) => a.durationSeconds - b.durationSeconds) })).filter((g) => g.options.length > 0);
  const start = routes[Math.min(initial, routes.length - 1)];
  const [mode, setMode] = useState<keyof typeof MODE>((groups.find((g) => g.mode === start.mode) ?? groups[0]).mode);
  const group = groups.find((g) => g.mode === mode) ?? groups[0];
  const [option, setOption] = useState(Math.max(0, group.options.indexOf(start)));
  const route = group.options[Math.min(option, group.options.length - 1)];
  const settled = useSettled();
  const ends = splitRouteEnds(route.from, route.to);
  const fastest = Math.min(...routes.map((r) => r.durationSeconds));
  const legs = legsOfRoute(route);
  const tags = tagsOf(group.options);
  const choose = (r: RouteBlock) => {
    const g = groups.find((x) => x.options.includes(r));
    if (!g) return;
    setMode(g.mode);
    setOption(g.options.indexOf(r));
  };
  const overlay = overlayOfRoutes(routes, route, choose);
  const maps = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(route.from)}&destination=${encodeURIComponent(route.to)}&travelmode=${MODE[mode].travelmode}`;

  return (
    <div className="space-y-5 p-4 pb-8">
      {/* Pinned: the options below scroll past it, and the line changes as you pick one. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-surface px-4 pb-3 pt-4">
        {legs.length > 0 && settled ? (
          <LazyTripMap className="h-[30vh] min-h-[200px] max-h-[300px]" pins={pointsFromRoute(route).map((p) => ({ id: p.id, name: p.name, lng: p.lng!, lat: p.lat!, kind: p.kind }))} legs={legs} overlay={overlay} fitControl scaleBar activeDay="all" />
        ) : legs.length > 0 ? (
          <Skeleton className="h-[30vh] min-h-[200px] max-h-[300px]" />
        ) : (
          // No line to draw: the journey as a strip (where from, how far, where to) instead of a tall empty box.
          <div className={cn(surface, "flex items-center gap-3 px-4 py-4")}>
            <span aria-hidden className="size-2.5 shrink-0 rounded-full border-2 border-foreground bg-card" />
            <span className="min-w-0 max-w-[40%] truncate text-sm font-medium">{ends.from}</span>
            <span aria-hidden className="h-px flex-1 border-t border-dashed border-muted-foreground/50" />
            <span className="shrink-0 font-display text-sm font-semibold tabular-nums">{minutes(route.durationSeconds)}</span>
            <span aria-hidden className="h-px flex-1 border-t border-dashed border-muted-foreground/50" />
            <span className="min-w-0 max-w-[40%] truncate text-right text-sm font-medium">{ends.to}</span>
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-foreground" />
          </div>
        )}
      </div>

      {ends.where && <p className={type.meta}>{ends.where}</p>}

      {groups.length > 1 && (
        <SlidingTabs
          label="How to get there"
          className="w-full"
          tabClassName="h-auto flex-1 py-2"
          value={mode}
          onChange={(m) => { setMode(m); setOption(0); }}
          items={groups.map((g) => {
            const Icon = MODE[g.mode].icon;
            return {
              key: g.mode,
              content: (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4" aria-hidden />{MODE[g.mode].label}</span>
                  <span className="text-xs tabular-nums opacity-80">{minutes(g.options[0].durationSeconds)}{g.options[0].durationSeconds === fastest ? " · fastest" : ""}</span>
                </>
              ),
            };
          })}
        />
      )}

      <ContentSwap swapKey={mode}>
      <section className="space-y-2" aria-label={`${MODE[mode].label} options`}>
        {group.options.length > 1 && <h3 className={type.meta}>{group.options.length} ways by {MODE[mode].label.toLowerCase()}</h3>}
        <div role={group.options.length > 1 ? "radiogroup" : undefined} className="space-y-2">
          {group.options.map((r, i) => (
            <OptionCard key={`${mode}-${i}`} route={r} index={i} single={group.options.length === 1} tag={tags[i]} on={i === option} onSelect={() => setOption(i)} />
          ))}
        </div>
      </section>
      </ContentSwap>

      {legs.length > 0 && (
        <a href={fullMapHref(tripId, route)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-medium transition-[background-color,transform] hover:bg-accent/40 active:scale-[0.98]">
          <Expand className="size-4" aria-hidden /> Open on the full map
        </a>
      )}
      <a href={maps} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]">
        {route.mode === "transit" ? "See live departures in Google Maps" : "Open in Google Maps"} <ArrowUpRight className="size-4" aria-hidden />
      </a>
      {route.mode === "transit" && <Notice>These are typical journeys. Departures and delays change, so check them live before you leave.</Notice>}
    </div>
  );
}
