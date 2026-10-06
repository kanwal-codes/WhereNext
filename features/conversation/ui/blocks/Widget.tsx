"use client";

import React, { type ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The frame every Roam widget (flights, route, budget, weather, plan, checklist, ...) is built from, so they
 * read as one family:
 *
 *   1 header  a tinted icon chip for the kind, a small eyebrow, a title that is the answer, a status pill
 *   2 hero    one tinted band holding the single figure or visual (a price, a temperature, a map)
 *   3 rows    lead chip, title and detail, a mini visual that fills the middle, a value on the right edge
 *   4 foot    a one-line caveat on the left, the one next step on the right
 *
 * Colour carries meaning: lagoon for transit, flights and weather, sage for money and "fits", coral for plans
 * and places, plum for events, saffron for caution.
 */

export type WidgetTone = "coral" | "lagoon" | "sage" | "plum" | "saffron";

const CHIP: Record<WidgetTone, string> = {
  coral: "bg-coral-soft text-coral-ink",
  lagoon: "bg-lagoon-soft text-lagoon",
  sage: "bg-positive-soft text-positive",
  plum: "bg-plum-soft text-plum",
  saffron: "bg-caution-soft text-caution",
};
const HERO: Record<WidgetTone, string> = {
  coral: "bg-[linear-gradient(135deg,var(--coral-soft),oklch(0.99_0.006_60))]",
  lagoon: "bg-[linear-gradient(160deg,var(--lagoon-soft),oklch(0.99_0.004_220))]",
  sage: "bg-[linear-gradient(135deg,var(--positive-soft),oklch(0.99_0.006_160))]",
  plum: "bg-[linear-gradient(135deg,var(--plum-soft),oklch(0.99_0.004_305))]",
  saffron: "bg-[linear-gradient(135deg,var(--caution-soft),oklch(0.99_0.01_90))]",
};
const PILL: Record<WidgetTone | "neutral", string> = {
  neutral: "border border-border bg-surface text-ink-soft",
  coral: "bg-coral-soft text-coral-ink",
  lagoon: "bg-lagoon-soft text-lagoon",
  sage: "bg-positive-soft text-positive",
  plum: "bg-plum-soft text-plum",
  saffron: "bg-caution-soft text-caution",
};

/** A small status pill ("Fits your budget", "Fastest", "Over by 50"). */
export function WidgetPill({ tone = "neutral", icon: Icon, children, className }: { tone?: WidgetTone | "neutral"; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular-nums", PILL[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function Widget({
  icon: Icon, tone = "coral", eyebrow, title, status, hero, foot, action, className, children, label,
}: {
  icon: LucideIcon;
  tone?: WidgetTone;
  /** What kind of widget this is: "Flights · one way". */
  eyebrow?: ReactNode;
  /** The answer, not the label: "Toronto to London", "Fits your £150 a day". */
  title: ReactNode;
  /** Top right: a status pill, or a small control. */
  status?: ReactNode;
  /** The one figure or visual, in a `WidgetHero`. */
  hero?: ReactNode;
  /** Bottom left, one line. */
  foot?: ReactNode;
  /** Bottom right: the one next step (`WidgetAction`). */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label} className={cn("roam-widget relative overflow-hidden rounded-3xl bg-card shadow-soft", className)}>
      <header className="flex items-center gap-3 px-4 pt-4 sm:px-[1.125rem]">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-[0.8125rem]", CHIP[tone])} aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="eyebrow truncate">{eyebrow}</p>}
          <h3 className="font-display text-[1.1875rem] leading-6 font-medium tracking-[-0.012em] text-balance">{title}</h3>
        </div>
        {status && <div className="flex shrink-0 items-center gap-2 max-sm:hidden">{status}</div>}
      </header>
      {status && <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5 sm:hidden">{status}</div>}
      {hero}
      {children}
      {(foot || action) && <WidgetFoot foot={foot} action={action} />}
    </section>
  );
}

/** The foot of a widget: a one-line caveat on the left, the one next step on the right. */
export function WidgetFoot({ foot, action }: { foot?: ReactNode; action?: ReactNode }) {
  return (
    <footer className="mt-1 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 sm:px-[1.125rem]">
      <div className="flex min-w-0 flex-1 items-start gap-1.5 text-[0.78125rem] leading-[1.35] text-muted-foreground">{foot}</div>
      {action && <div className="shrink-0">{action}</div>}
    </footer>
  );
}

/** The tinted band that holds the widget's single figure or visual. */
export function WidgetHero({ tone = "coral", className, children }: { tone?: WidgetTone; className?: string; children: ReactNode }) {
  return <div className={cn("mx-4 mt-3.5 rounded-[1.125rem] p-4 sm:mx-[1.125rem] sm:px-[1.375rem] sm:py-[1.125rem]", HERO[tone], className)}>{children}</div>;
}

/** The big number: a price, a temperature, a duration. */
export function WidgetFigure({ children, unit, className }: { children: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-display text-[3rem] leading-[1] font-medium tracking-[-0.04em] tabular-nums sm:text-[3.5rem]">{children}</span>
      {unit && <span className="text-base text-ink-soft">{unit}</span>}
    </span>
  );
}

/** A list of rows under the hero. Each row ends on a value, never a blank right edge. */
export function WidgetRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-3.5 divide-y divide-border border-t border-border", className)}>{children}</div>;
}
export function WidgetRow({ lead, title, detail, mid, value, className, onClick, label }: { label?: string; lead?: ReactNode; title: ReactNode; detail?: ReactNode; /** A mini visual (a bar) that fills the middle. */ mid?: ReactNode; value?: ReactNode; className?: string; onClick?: () => void }) {
  const body = (
    <>
      {lead}
      <div className="min-w-0 flex-1 sm:flex-none sm:basis-[34%]">
        <p className="truncate text-[0.9375rem] leading-snug font-medium">{title}</p>
        {detail && <p className="truncate text-xs leading-snug text-muted-foreground">{detail}</p>}
      </div>
      {mid && <div className="hidden min-w-0 flex-1 sm:block">{mid}</div>}
      {value && <div className="shrink-0 text-right">{value}</div>}
    </>
  );
  const cls = cn("flex items-center gap-3.5 px-4 py-3 sm:px-[1.125rem]", onClick && "w-full text-left transition-colors hover:bg-accent/40", className);
  return onClick ? <button type="button" onClick={onClick} aria-label={label} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

/** A value on a row's right edge: a figure and an optional small line under it. */
export function RowValue({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <p className="font-display text-lg leading-tight font-medium tabular-nums">{children}</p>
      {sub && <p className="text-[0.71875rem] leading-tight text-muted-foreground tabular-nums">{sub}</p>}
    </>
  );
}

/** The thin bar that fills a row's middle: `frac` of the track, in the row's colour. */
export function RowBar({ frac, color = "var(--coral)", className }: { frac: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="presentation">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color }} />
    </div>
  );
}

/** The widget's one next step: an ink pill. A link when it goes off the page. */
const ACTION = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16),0_1px_2px_oklch(0.2_0.012_65/0.3)] transition-[transform,filter] duration-200 ease-out hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ACTION_QUIET = "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-4 text-sm font-semibold text-ink transition-[transform,border-color] duration-200 ease-out hover:border-ink/30 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export function WidgetAction({ children, onClick, href, quiet = false, arrow = true, label }: { children: ReactNode; onClick?: () => void; href?: string; quiet?: boolean; arrow?: boolean; label?: string }) {
  const cls = quiet ? ACTION_QUIET : ACTION;
  const inner = (<>{children}{arrow && <ArrowUpRight className="size-4" aria-hidden />}</>);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label} className={cls}>{inner}</a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>{inner}</button>
  );
}
