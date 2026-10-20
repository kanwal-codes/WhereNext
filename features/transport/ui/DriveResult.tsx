"use client";

import { ExternalLink } from "lucide-react";
import { useDistance } from "@/components/use-distance";
import { estimateRideshare } from "@/lib/application/rideshare-estimate";
import { cn, durationFromSeconds, formatDuration } from "@/lib/utils";
import { ModeTile } from "@/features/maps/ui/modeParts";
import type { useTransportSearch } from "../application/useTransportSearch";
import { driveSaveValue, driveTrafficOf, lyftHref, uberHref } from "../domain/route-view";

/** The Drive tab: time, distance and live traffic, a rough rideshare price with links, and Save to my trip. */
export function DriveResult({ t }: { t: ReturnType<typeof useTransportSearch> }) {
  const distance = useDistance();
  const { from, to, tab, driveRoute, driveEnds, usdRate, saveChoice } = t;
  const { traffic: driveTraffic } = driveTrafficOf(driveRoute);
  return (
    <>
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
    </>
  );
}
