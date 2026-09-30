"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal, motionTokens } from "@/components/motion-primitives";
import { Check } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import type { BudgetBlock } from "@/components/TripPanelProvider";
import { Badge, Notice, money, surface, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";

/** One colour per category, shared by the spend bar and the ledger dots. Chart tokens, not coral: coral stays the brand accent. */
const TONE = [
  { bar: "bg-chart-1", soft: "bg-chart-1/40" },
  { bar: "bg-chart-2", soft: "bg-chart-2/40" },
  { bar: "bg-chart-3", soft: "bg-chart-3/40" },
  { bar: "bg-chart-4", soft: "bg-chart-4/40" },
  { bar: "bg-chart-5", soft: "bg-chart-5/40" },
  { bar: "bg-muted-foreground", soft: "bg-muted-foreground/40" },
] as const;

/** A day's spending, taken apart: the figure, where it goes, how far each line can swing, and what it adds up to. */
export function BudgetDetail({ block }: { block: BudgetBlock }) {
  const { data } = useTripData();
  const reduce = useReducedMotion();
  const cur = block.currency;
  const r = (n: number) => money(Math.round(n), cur);
  const total = block.lines.reduce((sum, l) => sum + l.typical, 0) || 1;
  const scale = Math.max(...block.lines.map((l) => l.high), 1);
  const typical = block.dailyTotal.typical;
  const gap = typeof block.setBudget === "number" ? Math.round(Math.abs(typical - block.setBudget)) : null;
  const under = typeof block.setBudget === "number" && typical <= block.setBudget;
  const days = data?.trip.duration_days ?? null;
  const travelers = data?.trip.travelers ?? null;
  const group = block.perPerson && travelers && travelers > 1 ? travelers : null;
  const unit = block.perPerson ? "per person" : "for the group";
  const share = block.lines.map((l) => `${l.category} ${Math.round((l.typical / total) * 100)}%`).join(", ");

  return (
    <div className="space-y-6 p-4 pb-8">
      <Reveal delay={0} y={10}><section aria-label="Typical day" className={cn(surface, "space-y-4 p-5")}>
        <div className="space-y-1.5">
          <p className={type.meta}>Typical day, {unit}</p>
          <p className="font-display text-5xl font-semibold leading-none tabular-nums tracking-[-0.04em]">{r(typical)}</p>
          <p className={cn(type.body, "tabular-nums text-muted-foreground")}>Usually between {r(block.dailyTotal.low)} and {r(block.dailyTotal.high)}</p>
        </div>
        <motion.div
          role="img"
          aria-label={`Share of a typical day: ${share}`}
          className="flex h-3 gap-0.5 overflow-hidden rounded-full"
          initial={reduce ? false : { clipPath: "inset(0 100% 0 0 round 9999px)" }}
          animate={{ clipPath: "inset(0 0% 0 0 round 9999px)" }}
          transition={{ duration: 0.7, ease: motionTokens.swap.ease, delay: 0.15 }}
        >
          {block.lines.map((l, i) => (
            <span key={l.category} className={cn("h-full first:rounded-l-full last:rounded-r-full", TONE[i % TONE.length].bar)} style={{ width: `${(l.typical / total) * 100}%` }} />
          ))}
        </motion.div>
        {(block.estimated || gap !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            {block.estimated && <Badge>Estimated</Badge>}
            {gap !== null && (
              <Badge tone={under ? "positive" : "caution"} icon={under ? Check : undefined}>
                {under ? `${r(gap)} under` : `${r(gap)} over`} your {r(block.setBudget!)}/day budget
              </Badge>
            )}
          </div>
        )}
      </section></Reveal>

      <Reveal delay={0.06} y={10}><section aria-label="Where it goes" className="space-y-3">
        <h3 className={type.section}>Where it goes</h3>
        <ul className={cn(surface, "divide-y divide-border")}>
          {block.lines.map((l, i) => {
            const tone = TONE[i % TONE.length];
            return (
              <li key={l.category} className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-baseline gap-3">
                  <span aria-hidden className={cn("size-2.5 shrink-0 translate-y-px rounded-full", tone.bar)} />
                  <span className={cn(type.body, "min-w-0 flex-1 font-medium")}>{l.category}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{Math.round((l.typical / total) * 100)}%</span>
                  <span className="w-20 text-right font-display text-base font-semibold tabular-nums">{r(l.typical)}</span>
                </div>
                {/* The span is low to high on one scale for every line; the dot is the typical day. */}
                <div className="relative h-1.5 rounded-full bg-muted" role="img" aria-label={`${l.category}: ${r(l.low)} to ${r(l.high)}, typically ${r(l.typical)}`}>
                  <motion.span
                    className={cn("absolute inset-y-0 rounded-full", tone.soft)}
                    style={{ left: `${(l.low / scale) * 100}%`, width: `${Math.max(((l.high - l.low) / scale) * 100, 1)}%`, originX: 0 }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ ...motionTokens.swap, delay: 0.25 + i * 0.07 }}
                  />
                  <motion.span
                    className={cn("absolute top-1/2 size-3 rounded-full ring-2 ring-card", tone.bar)}
                    style={{ left: `${(l.typical / scale) * 100}%`, x: "-50%", y: "-50%" }}
                    initial={reduce ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...motionTokens.lift, delay: 0.45 + i * 0.07 }}
                  />
                </div>
                <p className={cn(type.meta, "flex justify-between gap-3")}>
                  <span className="min-w-0 truncate">{l.note}</span>
                  <span className="shrink-0 tabular-nums">{r(l.low)} – {r(l.high)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </section></Reveal>

      <Reveal delay={0.12} y={10}><section aria-label="Over your trip" className="space-y-3">
        <h3 className={type.section}>Over your trip</h3>
        {days ? (
          <div className={cn("daisy-stats daisy-stats-vertical w-full border border-border bg-card sm:daisy-stats-horizontal", surface)}>
            <div className="daisy-stat px-5 py-4">
              <div className="daisy-stat-title text-xs text-muted-foreground">{block.perPerson ? "Per person" : "The group"}, {days} days</div>
              <div className="daisy-stat-value font-display text-3xl tabular-nums tracking-[-0.03em]">{r(typical * days)}</div>
              <div className="daisy-stat-desc text-xs tabular-nums">{r(block.dailyTotal.low * days)} – {r(block.dailyTotal.high * days)}</div>
            </div>
            {group && (
              <div className="daisy-stat px-5 py-4">
                <div className="daisy-stat-title text-xs text-muted-foreground">All {group} of you</div>
                <div className="daisy-stat-value font-display text-3xl tabular-nums tracking-[-0.03em]">{r(typical * days * group)}</div>
                <div className="daisy-stat-desc text-xs tabular-nums">{r(block.dailyTotal.low * days * group)} – {r(block.dailyTotal.high * days * group)}</div>
              </div>
            )}
          </div>
        ) : (
          <p className={cn(type.body, "text-muted-foreground")}>Set your trip dates and Roam can show what this adds up to.</p>
        )}
        <Notice tone={block.estimated ? "caution" : "neutral"}>
          {block.estimated ? "Roam had no live prices for this, so these figures come from general knowledge and may be out of date. " : ""}
          A typical day times the days of your trip. Flights and where you stay aren’t included.
        </Notice>
        {block.tripNote && <p className={cn(type.body, "text-ink-soft")}>{block.tripNote}</p>}
      </section></Reveal>
    </div>
  );
}
