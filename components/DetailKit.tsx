import React, { type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn, safeHref } from "@/lib/utils";

/**
 * The parts every detail view (place, stay, event) is built from, so a fact, an action or a
 * "show more" looks and behaves the same whichever kind of thing is open. daisyUI supplies the
 * structure (stats, btn); the app's tokens supply the colour, radius and type.
 */

/** A slot that may be left out: `cond && {…}` is fine, including when `cond` is an empty string. */
type Maybe<T> = T | null | false | undefined | "";
const present = <T,>(list: Array<Maybe<T>>): T[] => list.filter((item): item is T => Boolean(item));

export type Fact = { label: string; value: ReactNode; note?: ReactNode; tone?: "positive" | "caution" };
type Action = { icon: LucideIcon; label: string; href: string; external?: boolean };

/** The few numbers a thing is judged on — rating, price, open now — in one bordered strip with equal columns. */
export function FactStrip({ facts, className }: { facts: Array<Maybe<Fact>>; className?: string }) {
  const shown = present(facts);
  if (shown.length === 0) return null;
  return (
    <dl className={cn("daisy-stats w-full auto-cols-fr rounded-2xl border border-border bg-card shadow-soft", className)}>
      {shown.map((fact) => (
        <div key={fact.label} className="daisy-stat min-w-0 place-items-start content-start gap-y-0.5 border-b-0 border-solid border-border px-4 py-3">
          <dt className="daisy-stat-title text-xs text-muted-foreground">{fact.label}</dt>
          <dd
            className={cn(
              "daisy-stat-value flex min-w-0 items-center gap-1 font-display text-lg font-semibold leading-tight tracking-[-0.01em] break-words whitespace-normal",
              fact.tone === "positive" && "text-positive",
              fact.tone === "caution" && "text-caution",
            )}
          >
            {fact.value}
          </dd>
          {fact.note && <dd className="daisy-stat-desc text-xs text-muted-foreground opacity-100">{fact.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

const quickActionClass =
  "daisy-btn daisy-btn-outline h-auto border min-h-0 min-w-0 flex-col gap-1 rounded-2xl border-border bg-card px-2 py-3 text-xs font-medium normal-case text-ink-soft shadow-none hover:border-primary/40 hover:bg-card hover:text-foreground";

/** A row of equal-width secondary actions (Directions, Call, Website…), each an icon over a label. */
export function QuickActions({ actions }: { actions: Array<Maybe<Action>> }) {
  const shown = present(actions);
  if (shown.length === 0) return null;
  const alone = shown.length === 1; // one action reads better as a single button than as a wide tile
  return (
    <div className={cn("grid auto-cols-fr grid-flow-col gap-2", alone && "justify-start")}>
      {shown.map(({ icon: Icon, label, href, external }) => (
        <a key={label} href={href.startsWith("tel:") ? href : safeHref(href)} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})} className={cn(quickActionClass, alone && "h-11 flex-row gap-2 px-5 text-sm")}>
          <Icon className="size-4" aria-hidden />
          {label}
        </a>
      ))}
    </div>
  );
}

/** "Show 3 more reviews": a full-width quiet button, so the way to see more is plainly a control. */
export function ShowMore({ open, onToggle, more, less }: { open: boolean; onToggle: () => void; more: string; less: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="daisy-btn daisy-btn-soft daisy-btn-sm h-10 w-full gap-1.5 rounded-xl border-0 bg-muted text-xs font-medium normal-case text-ink-soft hover:text-foreground">
      {open ? less : more}
      <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
    </button>
  );
}

/** A labelled group of rows in one card (hours, phone, website…), hairline-divided, every row the same height. */
export function InfoList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card px-4 text-sm">{children}</ul>;
}

/** One row of an `InfoList`: icon · content … trailing. */
export function InfoRow({ icon: Icon, href, external, trailing, children }: { icon: LucideIcon; href?: string; external?: boolean; trailing?: ReactNode; children: ReactNode }) {
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </>
  );
  const row = "flex min-h-12 items-center gap-3";
  return (
    <li>
      {href ? (
        <a href={href.startsWith("tel:") ? href : safeHref(href)} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})} className={cn(row, "hover:text-primary")}>
          {inner}
        </a>
      ) : (
        <div className={row}>{inner}</div>
      )}
    </li>
  );
}
