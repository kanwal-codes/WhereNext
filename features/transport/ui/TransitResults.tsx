"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { sheetPrimary, sheetSecondary } from "@/components/motion/sheetActions";
import { useDistance } from "@/components/use-distance";
import type { RouteTag } from "@/lib/application/route-overlay";
import { MODE_LABEL } from "@/lib/application/mode-visuals";
import { cn, durationFromSeconds, formatDuration } from "@/lib/utils";
import { ModeTile, Ribbon, colorOf, railStyle } from "@/features/maps/ui/modeParts";
import type { useTransportSearch } from "../application/useTransportSearch";
import { clock, googleMapsTransitUrl, hexColor, mergeWalks, money, routeOrder, routeSummaries, transitSaveValue, type Step } from "../domain/route-view";

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

/**
 * The Transit tab: each route as a card (times, fare, a ribbon of the legs, changes and walking). Taking one draws it on the map and opens
 * its steps in a bottom sheet over the page, with Start in Google Maps and Save to my trip, instead of unfolding the card in place.
 */
export function TransitResults({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const distance = useDistance();
  const { from, to, tab, routes, selected, choose, saveChoice, routeSort } = t;
  const { meta: routeMeta, tags: routeTags } = routeSummaries(routes);
  const [open, setOpen] = useState<number | null>(null);
  const opened = open != null ? routes[open] : undefined;
  const openSteps = opened ? mergeWalks(opened.steps ?? []) : [];
  return (
    <>
      {tab === "transit" && routes.length > 0 && (
        <ul className="space-y-3" aria-label="Routes">
          {routeOrder(routes, routeSort).map((i) => {
            const route = routes[i];
            const tag = routeTags[i];
            const on = selected === i;
            const dep = clock(route.departureTime, route.timeZone);
            const arr = clock(route.arrivalTime, route.timeZone);
            const fare = money(route.fare);
            const steps = mergeWalks(route.steps ?? []);
            const rides = steps.filter((st) => (st.mode ?? "") !== "walk");
            return (
              <li key={i} className={cn("rounded-2xl bg-card transition-shadow duration-200", on ? "shadow-lift ring-[1.5px] ring-ink" : "ring-1 ring-border hover:ring-input")}>
                <button type="button" onClick={() => { choose(i); setOpen(i); }} aria-haspopup="dialog" className="block w-full rounded-2xl p-4 text-left">
                  <span className="flex items-center justify-between gap-3">
                    {tag ? (
                      <span className={cn("status-chip", tag === "fastest" && "status-ok")}>{TAG_TEXT[tag]}</span>
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">{distance(route.distanceMeters / 1000)}</span>
                    )}
                    <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                      {dep && arr && <span>{dep} → {arr}</span>}
                      <ChevronRight className="size-4" aria-hidden="true" />
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
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={tab === "transit" && opened != null} onClose={() => setOpen(null)} side="bottom" ariaLabel="Route details" footer={opened ? (<>
              <button type="button" onClick={() => void saveChoice(transitSaveValue(opened, from, to))} className={sheetSecondary}>
                Save to my trip
              </button>
              <a href={googleMapsTransitUrl(from, to)} target="_blank" rel="noreferrer noopener" className={sheetPrimary}>
                Start in Maps <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
</>) : undefined} padded>
        {opened && open != null && (
          <>
            <div className="pb-3 pt-1">
              <p className="font-display text-2xl font-medium leading-none tabular-nums tracking-[-0.025em]">{durationFromSeconds(opened.durationSeconds)}</p>
              <p className="mt-1.5 text-sm text-ink-soft tabular-nums">
                {[clock(opened.departureTime, opened.timeZone) && clock(opened.arrivalTime, opened.timeZone) ? `${clock(opened.departureTime, opened.timeZone)} → ${clock(opened.arrivalTime, opened.timeZone)}` : null, money(opened.fare), distance(opened.distanceMeters / 1000)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-1 px-1">
              {openSteps.length > 0 ? (
                <ol>
                  {openSteps.map((step, si) => (
                    <StepRow key={si} step={step} last={si === openSteps.length - 1} />
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-soft">No step-by-step breakdown was returned for this route.</p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {opened.fare
                  ? "Buy this fare from the operator’s app or a station machine. A single ticket or day pass usually covers the whole trip."
                  : "Check the operator’s app or a station machine for the current fare and tickets."}
              </p>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
