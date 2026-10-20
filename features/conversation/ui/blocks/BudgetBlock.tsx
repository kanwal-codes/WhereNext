"use client";

import { Check } from "lucide-react";
import type { AssistantBlock } from "@/packages/contracts/assistant";
import { cn } from "@/lib/utils";
import { RowBar, RowValue, Widget, WidgetAction, WidgetFigure, WidgetHero, WidgetPill, WidgetRow, WidgetRows } from "./Widget";
import { money, type } from "./ui";
import { BlockHandlers } from "./blockShared";

type BudgetBlockData = Extract<AssistantBlock, { type: "budget" }>;

/** One colour per line, the same as the budget panel's ledger, so the card and its expanded form read as one thing. */
const BUDGET_COLOR = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-muted-foreground)"] as const;

/** The day's spend as a ring: each category's share, with the total in the middle. */
function BudgetRing({ block }: { block: BudgetBlockData }) {
  const total = block.lines.reduce((sum, line) => sum + line.typical, 0) || 1;
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-[8.25rem] shrink-0 @max-[34rem]:hidden" role="img" aria-label="Share of the day's spend by category">
      <circle cx="60" cy="60" r={r} fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="14" />
      {block.lines.map((line, i) => {
        const len = (c * line.typical) / total;
        const seg = (
          <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)]} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${Math.max(0, len - 3)} ${c - Math.max(0, len - 3)}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        );
        offset += len;
        return seg;
      })}
      <text x="60" y="58" textAnchor="middle" className="fill-foreground font-display text-xl font-medium">{compactMoney(block.dailyTotal.typical, block.currency)}</text>
      <text x="60" y="75" textAnchor="middle" className="fill-ink-soft text-[10px]">per day</text>
    </svg>
  );
}

export function BudgetBlockView({ block, onOpenPanel }: { block: BudgetBlockData } & Pick<BlockHandlers, "onOpenPanel">) {
  const maxTypical = Math.max(...block.lines.map((line) => line.typical), 1);
  const hasBudget = typeof block.setBudget === "number";
  const under = hasBudget && block.dailyTotal.typical <= (block.setBudget as number);
  const cur = block.currency;
  const gap = hasBudget ? Math.abs(Math.round((block.setBudget as number) - block.dailyTotal.typical)) : 0;
  const scale = hasBudget ? Math.max(block.setBudget as number, block.dailyTotal.typical) * 1.05 : 1;
  return (
    <Widget
      glyph="budget"
      tone={hasBudget && !under ? "saffron" : "sage"}
      eyebrow={`Daily spend · ${block.perPerson ? "per person" : "for the group"}`}
      title={hasBudget ? (gap === 0 ? <>Right on your {money(Math.round(block.setBudget as number), cur)} a day</> : <>{under ? "Fits your" : "Over your"} {money(Math.round(block.setBudget as number), cur)} a day</>) : "Your typical day"}
      status={block.estimated ? <WidgetPill>Estimated</WidgetPill> : undefined}
      hero={
        <WidgetHero tone={hasBudget && !under ? "saffron" : "sage"} tinted className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-1">Typical day</p>
            <WidgetFigure>{money(Math.round(block.dailyTotal.typical), cur)}</WidgetFigure>
            <p className={cn(type.meta, "mt-1 tabular-nums")}>usually {money(Math.round(block.dailyTotal.low), cur)} to {money(Math.round(block.dailyTotal.high), cur)}</p>
            {hasBudget && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <WidgetPill tone={under ? "sage" : "saffron"} icon={under ? Check : undefined}>{gap === 0 ? "Exactly on budget" : `${money(gap, cur)} ${under ? "under" : "over"} budget`}</WidgetPill>
                  {block.tripNote && <span className={type.meta}>{block.tripNote}</span>}
                </div>
                <div className="relative mt-4 h-2 rounded-full bg-foreground/10" role="img" aria-label={`Typical day against a ${money(Math.round(block.setBudget as number), cur)} budget`}>
                  <div className={cn("h-full rounded-full", under ? "bg-positive" : "bg-caution")} style={{ width: `${Math.min(100, (block.dailyTotal.typical / scale) * 100)}%` }} />
                  <span className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${Math.min(100, ((block.setBudget as number) / scale) * 100)}%` }} aria-hidden />
                </div>
                <p className={cn(type.meta, "mt-1.5")}>Your budget {money(Math.round(block.setBudget as number), cur)}</p>
              </>
            )}
            {!hasBudget && block.tripNote && <p className={cn(type.meta, "mt-2")}>{block.tripNote}</p>}
          </div>
          <BudgetRing block={block} />
        </WidgetHero>
      }
      foot={block.estimated ? "Not backed by a current source: treat these as rough" : hasBudget && block.tripNote ? "Estimates from typical prices, not quotes" : "Estimates from typical prices, not quotes. Excludes flights and hotel."}
      action={onOpenPanel ? <WidgetAction onClick={() => onOpenPanel({ kind: "budget", block })} label="Budget details">Details</WidgetAction> : undefined}
    >
      <WidgetRows>
        {block.lines.map((line, i) => (
          <WidgetRow
            key={i}
            lead={<span aria-hidden className="size-3 shrink-0 rounded-[0.3125rem]" style={{ background: BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)] }} />}
            title={line.category}
            detail={line.note}
            mid={<RowBar frac={line.typical === 0 ? 0 : line.typical / maxTypical} color={BUDGET_COLOR[Math.min(i, BUDGET_COLOR.length - 1)]} />}
            value={<RowValue sub={rangeOf(line.low, line.high, cur)}>{priceOrFree(line.typical, cur)}</RowValue>}
          />
        ))}
      </WidgetRows>
    </Widget>
  );
}

/** Money for a row: zero is the word Free, never a bare 0. */
const priceOrFree = (amount: number, currency: string) => (Math.round(amount) === 0 ? "Free" : money(Math.round(amount), currency));

/** A range for a row ("£30–£100", "Free–£20", "Free"). */
const rangeOf = (low: number, high: number, currency: string) => (Math.round(high) === 0 ? "Free" : `${priceOrFree(low, currency)}–${money(Math.round(high), currency)}`);

/** Compact money for the middle of a ring ("¥22.9k"), so a big number never overflows it. */
function compactMoney(amount: number, currency: string): string {
  if (amount < 10000) return money(Math.round(amount), currency);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return money(Math.round(amount), currency);
  }
}
