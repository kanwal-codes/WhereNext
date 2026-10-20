"use client";

import React, { useState } from "react";
import { useDistance } from "@/components/use-distance";
import { formatDuration } from "@/lib/format-duration";
import { ArrowRight, Car, Check, PersonStanding, TrainFront, ChevronDown } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { RouteMap, type RouteMapRequest } from "./RouteMap";
import { MODE_COLOR } from "@/lib/application/mode-visuals";
import { RowBar, RowValue, Widget, WidgetAction, WidgetHero, WidgetPill, WidgetRow, WidgetRows } from "./Widget";
import { parseRouteStep, routeGlyph, routeLines, splitRouteEnds } from "./routeText";
import { controlSecondary, money, type } from "./ui";
import { BlockHandlers } from "./blockShared";

type RouteSummaryBlockData = Extract<AssistantBlock, { type: "route_summary" }>;

type RouteGroupBlock = { type: "route_group"; from: string; to: string; routes: RouteSummaryBlockData[] };

type RenderBlock = AssistantBlock | RouteGroupBlock;

const ROUTE_MODE_LABEL: Record<string, string> = { driving: "Drive", walking: "Walk", transit: "Transit" };

const routeModeIcon = (mode: string, steps: string[] = []) => routeGlyph(mode, steps)?.icon ?? (mode === "walking" ? PersonStanding : mode === "driving" ? Car : TrainFront);

/**
 * A "how do I get there" question now asks for more than one mode when none was named
 * (turn-resolver.ts), so the SAME from/to can arrive as several consecutive `route_summary`
 * blocks — one per mode. Grouping them here, at render time only, turns that into one "ways to
 * get there" comparison instead of N stacked identical-looking cards; the wire contract still
 * carries one block per mode.
 */
export function groupRouteSummaries(blocks: AssistantBlock[]): RenderBlock[] {
  const sameRoute = (a: RouteSummaryBlockData, b: RouteSummaryBlockData) =>
    a.from.trim().toLowerCase() === b.from.trim().toLowerCase() && a.to.trim().toLowerCase() === b.to.trim().toLowerCase();
  const out: RenderBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "route_summary") {
      out.push(block);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.type === "route_group" && sameRoute(prev.routes[0], block)) {
      prev.routes.push(block);
    } else {
      out.push({ type: "route_group", from: block.from, to: block.to, routes: [block] });
    }
  }
  return out;
}

/** "A → B" on one line when it fits; otherwise A, then "→ B" underneath, so the arrow never dangles alone. */
function RouteEnds({ from, to }: { from: string; to: string }) {
  const arrow = <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="to" />;
  if (from.length + to.length > 40) {
    return (
      <span className="block min-w-0">
        <span className="block break-words">{from}</span>
        <span className="flex items-start gap-1.5">
          <span className="flex h-[1.375em] items-center">{arrow}</span>
          <span className="min-w-0 break-words">{to}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="min-w-0 break-words">{from}</span>
      {arrow}
      <span className="min-w-0 break-words">{to}</span>
    </span>
  );
}

/** A journey's length as one figure: "26" min, "1:10" h, "1 d 2 h". */
function longDuration(minutes: number): { big: string; unit: string; rest?: { big: string; unit: string } } {
  if (minutes < 60) return { big: String(minutes), unit: "min" };
  if (minutes < 24 * 60) return { big: String(Math.floor(minutes / 60)), unit: "h", rest: { big: String(minutes % 60).padStart(2, "0"), unit: "min" } };
  return { big: String(Math.floor(minutes / 1440)), unit: "d", rest: { big: String(Math.floor((minutes % 1440) / 60)), unit: "h" } };
}

/** Minutes in a step's "35 min" / "1 h 05" text, for how wide its bar is. */
const stepMinutes = (duration?: string) => {
  if (!duration) return 0;
  const h = duration.match(/(\d+)\s*h/i), m = duration.match(/(\d+)\s*min/i);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};

const legColor = (leg: { mode: string; color?: string }) => (leg.color ? `#${leg.color.replace(/^#/, "")}` : MODE_COLOR[leg.mode === "walking" ? "walk" : leg.mode === "driving" ? "drive" : leg.mode] ?? MODE_COLOR.unknown);

/** The route drawn from its own coordinates on a quiet ground: each part in its mode's colour, a dark dot at the start, a coral pin at the end. */
function RouteSketch({ route }: { route: RouteSummaryBlockData }) {
  const parts = route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : [];
  const all = parts.flatMap((part) => part.path);
  if (all.length < 2) return null;
  const lat0 = (all.reduce((sum, [, lat]) => sum + lat, 0) / all.length) * (Math.PI / 180);
  const pts = (path: Array<[number, number]>) => path.map(([lng, lat]) => [lng * Math.cos(lat0), -lat] as const);
  const flat = pts(all);
  const minX = Math.min(...flat.map((p) => p[0])), maxX = Math.max(...flat.map((p) => p[0]));
  const minY = Math.min(...flat.map((p) => p[1])), maxY = Math.max(...flat.map((p) => p[1]));
  const W = 300, H = 176, pad = 22;
  const k = Math.min((W - pad * 2) / (maxX - minX || 1e-9), (H - pad * 2) / (maxY - minY || 1e-9));
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const project = (path: Array<[number, number]>) => pts(path).map(([x, y]) => `${(ox + (x - minX) * k).toFixed(1)},${(oy + (y - minY) * k).toFixed(1)}`);
  const first = project(all)[0].split(",").map(Number), last = project(all).at(-1)!.split(",").map(Number);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full min-h-[11rem] w-full" role="img" aria-label={`The route from ${route.from} to ${route.to}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="route-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1" /></pattern>
      </defs>
      <rect width={W} height={H} fill="var(--lagoon-soft)" />
      <rect width={W} height={H} fill="url(#route-grid)" />
      {parts.map((part, i) => <polyline key={`c${i}`} points={project(part.path).join(" ")} fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />)}
      {parts.map((part, i) => <polyline key={i} points={project(part.path).join(" ")} fill="none" stroke={part.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />)}
      <circle cx={first[0]} cy={first[1]} r="8" fill="white" />
      <circle cx={first[0]} cy={first[1]} r="4.5" fill="var(--foreground)" />
      <circle cx={last[0]} cy={last[1]} r="9" fill="white" />
      <circle cx={last[0]} cy={last[1]} r="5.5" fill="var(--coral)" />
    </svg>
  );
}

/** The journey as one ribbon, each part as wide as it takes. */
function RouteRibbon({ route }: { route: RouteSummaryBlockData }) {
  const parts = route.legs?.length
    ? route.legs.map((leg) => ({ minutes: leg.minutes, color: legColor(leg), walk: leg.mode === "walk" || leg.mode === "walking" }))
    : route.steps.map(parseRouteStep).map((step) => ({ minutes: stepMinutes(step.duration), color: step.glyph.label === "Walk" ? MODE_COLOR.walk : MODE_COLOR.transit, walk: step.glyph.label === "Walk" }));
  const total = parts.reduce((sum, part) => sum + part.minutes, 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2.5 gap-[3px]" role="img" aria-label="The journey, part by part">
      {parts.filter((part) => part.minutes > 0).map((part, i) => (
        <span key={i} className="min-w-1.5 rounded-full" style={{ flex: part.minutes, background: part.walk ? `repeating-linear-gradient(90deg, ${part.color} 0 3px, transparent 3px 6px)` : part.color, opacity: part.walk ? 0.7 : 1 }} />
      ))}
    </div>
  );
}

const clockOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null);

export function RouteSummaryCard({ route, onOpenPanel, onFollowup }: { route: RouteSummaryBlockData } & Pick<BlockHandlers, "onOpenPanel" | "onFollowup">) {
  const distance = useDistance();
  const ends = splitRouteEnds(route.from, route.to);
  const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
  const span = longDuration(minutes);
  const [allSteps, setAllSteps] = useState(false);
  // A short walk needs no map, ribbon or steps: one reassuring line is the whole answer.
  const nearby = route.mode === "walking" && minutes <= 5;
  const steps = route.steps.map(parseRouteStep).map((step) => ({ ...step, minutes: stepMinutes(step.duration) }));
  const longest = Math.max(...steps.map((step) => step.minutes), 1);
  const leaves = clockOf(route.departureTime), arrives = clockOf(route.arrivalTime);
  const drawable = (route.legs?.some((leg) => leg.path.length > 1) ?? false) || (route.path?.length ?? 0) > 1;
  // The same real street map the comparison card draws (the sketch stays underneath until it arrives, or if it never does).
  const lines = (route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : [])
    .filter((part) => part.path.length > 1);
  const mapRequest: RouteMapRequest | null = lines.length === 0 ? null : {
    lines: [
      ...lines.map((part) => ({ points: part.path, color: "#ffffff", width: 9 })),
      ...lines.map((part) => ({ points: part.path, color: part.color, width: 5 })),
    ],
    pins: [{ at: lines[0].path[0], color: "#27221e" }, { at: lines.at(-1)!.path.at(-1)!, color: "#ec6a3a" }],
    size: { width: 600, height: 352 },
  };
  return (
    <Widget
      glyph="route"
      tone="lagoon"
      eyebrow={`${ROUTE_MODE_LABEL[route.mode] ?? route.mode}${ends.where ? ` · ${ends.where}` : ""}`}
      title={<RouteEnds from={ends.from} to={ends.to} />}
      status={route.fare ? <WidgetPill tone="lagoon">{money(route.fare.amount, route.fare.currency)}</WidgetPill> : undefined}
      hero={nearby ? (
        <WidgetHero tone="lagoon" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="flex items-baseline gap-1.5"><span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.big}</span> <span className="text-base text-ink-soft">{span.unit}</span></p>
          <p className={cn(type.body, "min-w-0 flex-1 text-ink-soft")}>You are nearly there ({distance(route.distanceMeters / 1000)}). A short walk, no map needed.</p>
        </WidgetHero>
      ) : (
        <div className="mx-4 mt-3.5 flex flex-col gap-3.5 @[34rem]:mx-[1.125rem] @[34rem]:flex-row">
          {drawable && mapRequest && <div className="aspect-[300/176] shrink-0 overflow-hidden rounded-xl @[34rem]:aspect-auto @[34rem]:h-auto @[34rem]:w-[19rem]"><RouteMap request={mapRequest!} label={`The route from ${route.from} to ${route.to}`} fallback={<RouteSketch route={route} />} /></div>}
          <WidgetHero tone="lagoon" className="!m-0 flex min-w-0 flex-1 flex-col justify-between gap-3 @[34rem]:!p-[1.125rem]">
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.big}</span>{" "}
              <span className="text-base text-ink-soft">{span.unit}</span>
              {span.rest && (
                <>
                  {" "}
                  <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{span.rest.big}</span>{" "}
                  <span className="text-base text-ink-soft">{span.rest.unit}</span>
                </>
              )}
            </p>
            <p className={cn(type.meta, "tabular-nums")}>{[distance(route.distanceMeters / 1000), leaves ? `leaves ${leaves}` : null, arrives ? `arrives ${arrives}` : null].filter(Boolean).join(" · ")}</p>
            <RouteRibbon route={route} />
          </WidgetHero>
        </div>
      )}
      action={onOpenPanel && !nearby ? <WidgetAction wide onClick={() => onOpenPanel({ kind: "route", routes: [route], active: 0, onAsk: onFollowup })}>Directions</WidgetAction> : undefined}
    >
      {steps.length > 0 && !nearby && (
        <WidgetRows>
          {(allSteps ? steps : steps.slice(0, 5)).map((step, i) => (
            <WidgetRow
              key={i}
              lead={<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lagoon-soft text-lagoon" aria-hidden><step.glyph.icon className="size-[1.125rem]" /></span>}
              title={step.title}
              mid={step.minutes > 0 ? <RowBar frac={step.minutes / longest} color={step.glyph.label === "Walk" ? MODE_COLOR.walk : MODE_COLOR.transit} /> : undefined}
              value={step.duration ? <RowValue>{step.duration}</RowValue> : undefined}
            />
          ))}
        </WidgetRows>
      )}
      {steps.length > 5 && !nearby && !allSteps && (
        <div className="border-t border-border px-4 py-3 text-center">
          <button type="button" onClick={() => setAllSteps(true)} className={controlSecondary}>Show {steps.length - 5} more steps <ChevronDown className="size-3.5" aria-hidden /></button>
        </div>
      )}
    </Widget>
  );
}

/** 2+ modes between the same two places: a real map of every way, then one tab per mode with its routes listed under it. */
export function RouteComparisonCard({ from, to, routes, onOpenPanel, onFollowup }: { from: string; to: string; routes: RouteSummaryBlockData[] } & Pick<BlockHandlers, "onOpenPanel" | "onFollowup">) {
  const distance = useDistance();
  const sorted = [...routes].sort((a, b) => a.durationSeconds - b.durationSeconds);
  const fastest = sorted[0];
  const ends = splitRouteEnds(from, to);
  // One group per mode, the quickest mode first; each group's routes stay quickest first.
  const groups = [...new Set(sorted.map((route) => route.mode))].map((mode) => ({ mode, routes: sorted.filter((route) => route.mode === mode) }));
  const [mode, setMode] = useState(groups[0].mode);
  const [pick, setPick] = useState(0);
  const group = groups.find((g) => g.mode === mode) ?? groups[0];
  // One way only (several transit routes, say): nothing is being compared, so no "fastest way" claim and no lone tab.
  const compared = groups.length > 1;
  const chosen = group.routes[Math.min(pick, group.routes.length - 1)];
  const minutes = (route: RouteSummaryBlockData) => formatDuration(route.durationSeconds / 60);
  const slowest = Math.max(...group.routes.map((route) => route.durationSeconds), 1);
  const linesOf = (route: RouteSummaryBlockData) => (route.legs?.length ? route.legs.map((leg) => ({ path: leg.path, color: legColor(leg) })) : route.path ? [{ path: route.path, color: legColor({ mode: route.mode }) }] : []).filter((part) => part.path.length > 1);
  const chosenLines = linesOf(chosen);
  const mapRequest: RouteMapRequest | null = chosenLines.length === 0 ? null : {
    lines: [
      // The other ways: one faint line each (a transit route is several legs, but only the chosen one needs them drawn apart).
      ...sorted.filter((route) => route !== chosen).map((route) => ({ points: route.path && route.path.length > 1 ? route.path : linesOf(route).flatMap((part) => part.path), color: "#9fb3c6", width: 3, opacity: 0.8 })).filter((line) => line.points.length > 1),
      ...chosenLines.map((part) => ({ points: part.path, color: "#ffffff", width: 9 })),
      ...chosenLines.map((part) => ({ points: part.path, color: part.color, width: 5 })),
    ],
    pins: [{ at: chosenLines[0].path[0], color: "#27221e" }, { at: chosenLines.at(-1)!.path.at(-1)!, color: "#ec6a3a" }],
    size: { width: 640, height: 260 },
  };
  return (
    <Widget
      glyph="route"
      tone="lagoon"
      eyebrow={`${compared ? "Ways to get there" : ROUTE_MODE_LABEL[group.mode] ?? group.mode}${ends.where ? ` · ${ends.where}` : ""}`}
      title={<RouteEnds from={ends.from} to={ends.to} />}
      status={compared ? <WidgetPill tone="lagoon" icon={Check}>{ROUTE_MODE_LABEL[fastest.mode] ?? fastest.mode} is fastest</WidgetPill> : undefined}
      foot={onOpenPanel ? undefined : "Times are estimates"}
      action={onOpenPanel ? <WidgetAction wide onClick={() => onOpenPanel({ kind: "route", routes: sorted, active: sorted.indexOf(chosen), onAsk: onFollowup })}>Directions</WidgetAction> : undefined}
      hero={mapRequest && (
        <div className="relative mx-4 mt-3.5 aspect-[640/260] overflow-hidden rounded-xl bg-lagoon-soft @[34rem]:mx-[1.125rem]">
          <RouteMap request={mapRequest} label={`The ${ROUTE_MODE_LABEL[chosen.mode] ?? chosen.mode} route from ${from} to ${to}`} fallback={<RouteSketch route={chosen} />} />
          <span className="absolute top-2.5 left-2.5"><WidgetPill className="bg-white text-ink shadow-soft">{ROUTE_MODE_LABEL[chosen.mode] ?? chosen.mode} · {minutes(chosen)}</WidgetPill></span>
        </div>
      )}
    >
      {compared && <div role="tablist" aria-label="Ways to travel" className="mx-4 mt-3.5 flex gap-2 @[34rem]:mx-[1.125rem]">
        {groups.map((g) => {
          const Icon = routeModeIcon(g.mode);
          const on = g.mode === group.mode;
          return (
            <button
              key={g.mode}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setMode(g.mode); setPick(0); }}
              className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-ink/30")}
            >
              <Icon className="size-5 shrink-0 @max-[27rem]:hidden" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-[0.9375rem] leading-tight font-medium">{ROUTE_MODE_LABEL[g.mode] ?? g.mode}</span>
                <span className={cn("block truncate text-xs leading-tight tabular-nums", on ? "text-primary-foreground/70" : "text-muted-foreground")}>{g.routes.length > 1 ? `${g.routes.length} routes · ${minutes(g.routes[0])}` : (
                  <>{minutes(g.routes[0])}<span className="@max-[34rem]:hidden"> · {distance(g.routes[0].distanceMeters / 1000)}</span></>
                )}</span>
              </span>
              {g.routes[0] === fastest ? <WidgetPill tone="sage" className="ml-auto h-5 text-[0.6875rem] max-lg:text-xs @max-[34rem]:hidden">Fastest</WidgetPill> : minutes(g.routes[0]) === minutes(fastest) ? <WidgetPill className="ml-auto h-5 text-[0.6875rem] max-lg:text-xs @max-[34rem]:hidden">Same time</WidgetPill> : null}
            </button>
          );
        })}
      </div>}
      <WidgetRows className="mt-3">
        {group.routes.map((route, i) => (
          <WidgetRow
            key={i}
            onClick={() => setPick(i)}
            label={`${ROUTE_MODE_LABEL[route.mode] ?? route.mode}, ${minutes(route)}: show on the map`}
            lead={<span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", route === chosen ? "bg-lagoon text-white" : "bg-lagoon-soft text-lagoon")} aria-hidden>{React.createElement(routeModeIcon(route.mode, route.steps), { className: "size-[1.125rem]" })}</span>}
            title={<span className="inline-flex items-center gap-1.5">{(route.mode === "transit" && route.steps.length > 0 ? routeLines(route.steps) : null) || ROUTE_MODE_LABEL[route.mode] || route.mode}{group.routes.length > 1 && i === 0 ? <WidgetPill tone="sage" className="h-5 text-[0.6875rem] max-lg:text-xs">Quickest</WidgetPill> : null}</span>}
            detail={[clockOf(route.departureTime) ? `leaves ${clockOf(route.departureTime)}` : null, route.fare ? money(route.fare.amount, route.fare.currency) : null, distance(route.distanceMeters / 1000)].filter(Boolean).join(" · ")}
            mid={<RowBar frac={route.durationSeconds / slowest} color={route === fastest ? "var(--positive)" : "var(--lagoon)"} />}
            value={<RowValue>{minutes(route)}</RowValue>}
          />
        ))}
      </WidgetRows>
    </Widget>
  );
}
