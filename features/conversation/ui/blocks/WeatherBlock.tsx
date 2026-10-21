"use client";

import { Backpack, Check, Cloud, CloudRain, CloudSnow, CloudSun, Droplets, Footprints, Shirt, Snowflake, Sun, Umbrella } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { Widget, WidgetAction, WidgetFigure, WidgetHero, WidgetPill } from "./Widget";
import { Badge, type } from "./ui";
import { BlockHandlers } from "./blockShared";

type WeatherBlockData = Extract<AssistantBlock, { type: "weather" }>;

const WX_ICON = { clear: Sun, clouds: Cloud, rain: CloudRain, snow: CloudSnow, mixed: CloudSun } as const;

function WeatherGlyph({ condition, className }: { condition?: WeatherBlockData["condition"]; className?: string }) {
  const Icon = WX_ICON[condition ?? "mixed"];
  return <Icon className={cn("text-coral", className)} aria-hidden />;
}

/** A packing item gets the icon that matches it, not one umbrella for everything. */
function packIcon(item: string) {
  if (/boot|shoe|sneaker|sandal/i.test(item)) return Footprints;
  if (/umbrella|rain|waterproof|shell|poncho/i.test(item)) return Umbrella;
  if (/scarf|glove|thermal|wool|beanie|mitt|base layer/i.test(item)) return Snowflake;
  if (/jacket|coat|layer|sweater|fleece|parka|puffer|hoodie/i.test(item)) return Shirt;
  if (/\bsun|sunglass|spf|sunscreen/i.test(item)) return Sun;
  return Backpack;
}

/** The highs and lows as two quiet curves across the forecast days, in the hero. */
function TempCurve({ days }: { days: WeatherBlockData["days"] }) {
  const list = days.slice(0, 7);
  // Two points are not a trend: the curve needs at least three days.
  if (list.length < 3) return null;
  const w = 560, h = 72;
  const lo = Math.min(...list.map((d) => d.min)) - 2, hi = Math.max(...list.map((d) => d.max)) + 2;
  const x = (i: number) => 14 + (i * (w - 28)) / (list.length - 1);
  const y = (v: number) => h - 8 - ((v - lo) / (hi - lo || 1)) * (h - 16);
  const line = (key: "max" | "min") => list.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(0)} ${y(d[key]).toFixed(0)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-[4.5rem] w-full" role="img" aria-label="Highs and lows across the week">
      <path d={line("max")} fill="none" stroke="var(--coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line("min")} fill="none" stroke="var(--lagoon)" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {list.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.max)} r="3.6" fill="var(--coral)" />
          <circle cx={x(i)} cy={y(d.min)} r="3.2" fill="var(--lagoon)" fillOpacity="0.8" />
        </g>
      ))}
    </svg>
  );
}

function PackRow({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-4 @[34rem]:px-[1.125rem]">
      <span className="eyebrow mr-1">Pack</span>
      {items.map((item) => (
        <Badge key={item} icon={packIcon(item)}>{item}</Badge>
      ))}
    </div>
  );
}

export function WeatherBlockView({ block, onOpenPanel }: { block: WeatherBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  // Phone redesign: the card opens its week as a sheet (flag on, below lg).
  const seeWeek = onOpenPanel ? <WidgetAction quiet arrow={false} onClick={() => onOpenPanel({ kind: "weather", block })}>See the week</WidgetAction> : undefined;
  if (block.mode === "forecast" && block.days.length > 0) {
    const days = block.days.slice(0, 7);
    const dry = days.filter((d) => !d.wet).map((d) => d.label);
    const wet = days.filter((d) => d.wet).length;
    const Icon = WX_ICON[days[0]?.condition ?? "mixed"];
    return (
      <Widget
        glyph="weather"
        tone="lagoon"
        eyebrow={`Forecast${block.location ? ` · ${block.location}` : ""}`}
        title={block.headline}
        status={wet > 0 ? <WidgetPill tone="lagoon" icon={Droplets}>{wet} wet day{wet === 1 ? "" : "s"}</WidgetPill> : <WidgetPill tone="sage" icon={Check}>All dry</WidgetPill>}
        hero={
          <WidgetHero tone="lagoon" tinted className="relative overflow-hidden pb-2">
            <Icon className="absolute top-3 right-4 size-16 text-caution/80 @max-[34rem]:hidden" strokeWidth={1.2} aria-hidden />
            <WidgetFigure unit={days[0]?.label ? `high ${days[0].label.toLowerCase() === "today" ? "today" : `on ${days[0].label}`}` : undefined}>{degrees(days[0]?.max ?? 0)}</WidgetFigure>
            <TempCurve days={days} />
          </WidgetHero>
        }
        foot={dry.length > 0 && wet > 0 ? <>Driest days: {dry.slice(0, 4).join(", ")}</> : <>Forecast for the next {days.length} days</>}
        action={seeWeek ? <span className="lg:hidden">{seeWeek}</span> : undefined}
      >
        <ul className="no-scrollbar grid gap-1 overflow-x-auto px-3 pt-3.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${days.length > 6 ? "3.5rem" : "0px"}, 1fr))` }}>
          {days.map((day, i) => (
            <li key={i} className="flex min-w-0 flex-col items-center gap-1 px-0.5 py-1.5 text-center">
              <span className={cn(type.meta, "font-semibold text-ink-soft")}>{day.label}</span>
              <WeatherGlyph condition={day.condition} className={cn("size-6", day.wet ? "text-lagoon" : "text-caution")} />
              <span className="font-display text-base leading-tight font-medium tabular-nums">{degrees(day.max)}</span>
              <span className={cn(type.meta, "tabular-nums")}>{degrees(day.min)}</span>
              <span className="mt-1 grid h-4 place-items-center">{day.wet ? <Droplets className="size-4 text-lagoon" aria-label="Rain expected" /> : null}</span>
            </li>
          ))}
        </ul>
        <PackRow items={block.packing} />
      </Widget>
    );
  }

  const rainy = typeof block.rainyDays === "number" ? Math.max(0, Math.min(31, Math.round(block.rainyDays))) : 0;
  return (
    <Widget
      glyph="weather"
      tone="lagoon"
      eyebrow={block.mode === "forecast" ? `Forecast not ready${block.location ? ` · ${block.location}` : ""}` : `Typical ${block.month ?? "weather"}${block.location ? ` · ${block.location}` : ""}`}
      title={block.headline}
      status={block.estimated ? <WidgetPill>Estimated</WidgetPill> : undefined}
      hero={
        (typeof block.highC === "number" || typeof block.lowC === "number" || rainy > 0) ? (
          <WidgetHero tone="lagoon" tinted className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {(typeof block.highC === "number" || typeof block.lowC === "number") && (
              <div className="shrink-0 grow">
                <p className="flex items-baseline gap-x-2 whitespace-nowrap">
                  {typeof block.highC === "number" && <span className="font-display text-[3.5rem] leading-none font-medium tracking-[-0.04em] tabular-nums">{degrees(block.highC)}</span>}
                  {typeof block.lowC === "number" && <span className="text-base text-ink-soft tabular-nums">/ {degrees(block.lowC)}</span>}
                </p>
                <p className={cn(type.meta, "mt-1")}>typical high and low</p>
              </div>
            )}
            {rainy > 0 && (
              <div className="min-w-[11rem] max-w-[15rem] flex-1">
                <p className="eyebrow mb-2">Rainy days</p>
                <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1" role="img" aria-label={`About ${rainy} rainy days that month`}>
                  {Array.from({ length: 30 }, (_, i) => (
                    <span key={i} className={cn("aspect-square rounded-full", i < rainy ? "bg-lagoon" : "bg-lagoon/20")} />
                  ))}
                </div>
                <p className={cn(type.meta, "mt-2")}>about {rainy} rainy day{rainy === 1 ? "" : "s"} that month</p>
              </div>
            )}
          </WidgetHero>
        ) : undefined
      }
      foot={block.mode === "forecast" ? "No forecast yet, so this is the typical month. A real forecast arrives about a week before the trip." : "Typical values from past years, not a forecast"}
      action={seeWeek ? <span className="lg:hidden">{seeWeek}</span> : undefined}
    >
      <PackRow items={block.packing} />
    </Widget>
  );
}

/** A temperature with a true minus sign: "−23°", "16°". */
const degrees = (n: number) => (n < 0 ? `−${Math.abs(n)}°` : `${n}°`);
