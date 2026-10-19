"use client";

import React from "react";
import { Cloud, CloudRain, CloudSnow, CloudSun, Droplets, Sun } from "lucide-react";
import { Reveal } from "@/components/motion-primitives";
import type { WeatherBlock } from "@/components/TripPanelProvider";
import { Badge, surface, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { BigFigure, PanelHeader } from "./PanelHeader";

const ICON = { clear: Sun, clouds: Cloud, rain: CloudRain, snow: CloudSnow, mixed: CloudSun } as const;
const deg = (n: number) => (n < 0 ? `−${Math.abs(n)}°` : `${n}°`);

/** The week in a weather card, laid out as a week: today's figure, then each day as a bar from its low to its high on one shared scale. */
export function WeatherDetail({ block }: { block: WeatherBlock }) {
  const days = block.days.slice(0, 10);
  const lo = days.length ? Math.min(...days.map((d) => d.min)) - 1 : 0;
  const hi = days.length ? Math.max(...days.map((d) => d.max)) + 1 : 1;
  const span = hi - lo || 1;
  const wet = days.filter((d) => d.wet).length;
  const headline = days[0]?.max ?? block.highC;
  return (
    <div className="space-y-6 p-4 pb-8">
      <Reveal delay={0} y={10}>
        <section aria-label="Weather" className={cn(surface, "space-y-4 p-5")}>
          <PanelHeader eyebrow={[block.mode === "forecast" && days.length ? "Forecast" : `Typical ${block.month ?? "weather"}`, block.location ?? "Your trip"]} sub={block.headline}>
            {typeof headline === "number" ? <BigFigure text={deg(headline)} /> : <p className="font-display text-2xl">{block.headline}</p>}
          </PanelHeader>
          <div className="flex flex-wrap items-center gap-2">
            {block.estimated && <Badge>Estimated</Badge>}
            {days.length > 0 && (wet > 0 ? <Badge icon={Droplets} className="bg-lagoon-soft text-lagoon">{wet} wet day{wet === 1 ? "" : "s"}</Badge> : <Badge tone="positive">All dry</Badge>)}
            {days.length === 0 && typeof block.lowC === "number" && <Badge>Low {deg(block.lowC)}</Badge>}
            {days.length === 0 && typeof block.rainyDays === "number" && block.rainyDays > 0 && <Badge icon={Droplets} className="bg-lagoon-soft text-lagoon">About {Math.round(block.rainyDays)} rainy days</Badge>}
          </div>
        </section>
      </Reveal>

      {days.length > 0 && (
        <Reveal delay={0.06} y={10}>
          <section aria-label="Day by day" className="space-y-3">
            <h3 className={type.section}>Day by day</h3>
            <ul className={cn(surface, "divide-y divide-border")}>
              {days.map((d, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-10 shrink-0 text-sm font-semibold text-ink-soft">{d.label}</span>
                  {React.createElement(ICON[d.condition ?? "mixed"], { className: cn("size-5 shrink-0", d.wet ? "text-lagoon" : "text-caution"), "aria-hidden": true })}
                  <span className="w-5 shrink-0">{d.wet && <Droplets className="size-4 text-lagoon" aria-label="Rain expected" />}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{deg(d.min)}</span>
                  <span className="relative h-1.5 min-w-8 flex-1 rounded-full bg-muted" aria-hidden>
                    <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-lagoon to-caution" style={{ left: `${((d.min - lo) / span) * 100}%`, right: `${100 - ((d.max - lo) / span) * 100}%` }} />
                  </span>
                  <span className="w-9 shrink-0 text-right font-display text-base font-medium tabular-nums">{deg(d.max)}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {block.packing.length > 0 && (
        <Reveal delay={0.12} y={10}>
          <section aria-label="What to pack" className="space-y-3">
            <h3 className={type.section}>What to pack</h3>
            <div className="flex flex-wrap gap-1.5">{block.packing.map((item) => <Badge key={item}>{item}</Badge>)}</div>
          </section>
        </Reveal>
      )}
    </div>
  );
}
