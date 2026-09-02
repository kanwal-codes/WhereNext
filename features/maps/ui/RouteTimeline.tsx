"use client";

import { useState } from "react";
import { Bus, Car, ChevronDown, Footprints, Route, Ship, TrainFront } from "lucide-react";
import type { RouteDay, RouteLegStep } from "@/packages/contracts/route-plan";
import { formatMoney } from "@/lib/currency";
import { cn, formatDuration } from "@/lib/utils";

const MODE_ICON: Record<string, typeof Bus> = {
  walk: Footprints, bus: Bus, subway: TrainFront, tram: TrainFront, train: TrainFront, ferry: Ship, drive: Car, transit: Bus, unknown: Route,
};
const MODE_COLOR: Record<string, string> = {
  walk: "#9aa0a6", bus: "#2563eb", subway: "#e2603f", tram: "#0891b2", train: "#16a34a", ferry: "#0d9488", drive: "#6b7280", transit: "#2563eb", unknown: "#9aa0a6",
};

const time = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function StepLine({ s }: { s: RouteLegStep }) {
  const Icon = MODE_ICON[s.mode] ?? Route;
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: MODE_COLOR[s.mode] }} />
      <span className="min-w-0">
        {s.mode === "walk" ? (
          <>Walk {formatDuration(s.minutes)}{s.to ? ` to ${s.to}` : ""}</>
        ) : (
          <>
            {s.line && (
              <span className="mr-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white" style={{ background: s.color ? `#${s.color.replace("#", "")}` : MODE_COLOR[s.mode] }}>
                {s.line}
              </span>
            )}
            {s.headsign ? `toward ${s.headsign}` : s.mode}
            {s.stopCount ? ` · ${s.stopCount} stop${s.stopCount === 1 ? "" : "s"}` : ""} · {formatDuration(s.minutes)}
            {s.from && s.to ? <span className="block text-[11px]">{s.from} → {s.to}</span> : null}
          </>
        )}
      </span>
    </div>
  );
}

export function RouteTimeline({ day, onHoverLeg }: { day: RouteDay; onHoverLeg?: (index: number | null) => void }) {
  const [open, setOpen] = useState<number | null>(null);

  if (day.stops.length < 2) {
    return <p className="text-sm text-muted-foreground">Add at least two stops to this day to see how to get between them.</p>;
  }

  const s = day.summary;
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Day {day.day} · {day.stops.length} stops · ~{formatDuration(s.movingMinutes)} moving
        {s.transitRides ? ` · ${s.transitRides} transit ride${s.transitRides === 1 ? "" : "s"}` : ""}
        {s.fare ? ` · ~${formatMoney(s.fare.amount, s.fare.currency)} fares` : ""}
      </p>

      <ol className="mt-3">
        {day.stops.map((stop, i) => {
          const leg = i < day.legs.length ? day.legs[i] : null;
          const LegIcon = leg ? MODE_ICON[leg.mode] ?? Route : Route;
          return (
            <li key={stop.id}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
                <span className="truncate text-sm font-medium">{stop.name}</span>
              </div>

              {leg && (
                <div
                  className="my-1 ml-2.5 border-l border-border pl-4"
                  onMouseEnter={() => onHoverLeg?.(i)}
                  onMouseLeave={() => onHoverLeg?.(null)}
                >
                  {leg.kind === "longhaul" ? (
                    <p className="py-1 text-xs text-coral">{leg.note}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(open === i ? null : i)}
                      className="flex w-full items-center gap-2 py-1 text-left text-xs"
                    >
                      <LegIcon className="h-3.5 w-3.5 shrink-0" style={{ color: MODE_COLOR[leg.mode] }} />
                      <span className="font-medium">
                        {leg.minutes != null ? formatDuration(leg.minutes) : "route"}
                        {leg.km != null ? ` · ${leg.km} km` : ""}
                        {time(leg.departure) && time(leg.arrival) ? ` · ${time(leg.departure)}–${time(leg.arrival)}` : ""}
                      </span>
                      {leg.steps.length > 1 && <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open === i && "rotate-180")} />}
                    </button>
                  )}
                  {leg.note && leg.kind === "local" && <p className="pb-1 text-[11px] text-muted-foreground">{leg.note}</p>}
                  {open === i && leg.steps.length > 0 && (
                    <div className="space-y-1.5 border-l border-dashed border-border pb-2 pl-3">
                      {leg.steps.map((st, k) => <StepLine key={k} s={st} />)}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
