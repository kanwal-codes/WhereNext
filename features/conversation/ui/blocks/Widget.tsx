"use client";

import { FitText } from "@/components/FitText";
import React, { type ReactNode } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoamIcon, type RoamIconName } from "@/features/roam/ui/RoamIcon";
import { PHONE_V2 } from "@/lib/phone-v2";

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
  // Money and caution are shown by the pill and the bar, not by tinting the whole band.
  sage: "bg-secondary",
  plum: "bg-secondary",
  saffron: "bg-secondary",
};
const PILL: Record<WidgetTone | "neutral", string> = {
  neutral: "bg-secondary text-ink-soft",
  coral: "bg-secondary text-foreground status-dot status-brand",
  lagoon: "bg-secondary text-foreground status-dot status-info",
  sage: "bg-secondary text-foreground status-dot status-ok",
  plum: "bg-secondary text-foreground status-dot status-brand",
  saffron: "bg-secondary text-foreground status-dot status-warn",
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
  icon: Icon, glyph, tone = "coral", eyebrow, title, status, hero, foot, action, className, children, label,
}: {
  /** The chip's icon when there is no Roam line icon for the kind. */
  icon?: LucideIcon;
  /** Roam's own line icon for this kind of widget; it draws itself in when the reply is live. */
  glyph?: RoamIconName;
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
  // Phone redesign (below lg, flag on): no tinted icon chip. The kind of widget is a small coral eyebrow with its icon, the title is
  // the answer in 22px Outfit, and the corners are 28px. Everything else about the frame is unchanged.
  const eyebrowIcon = glyph ? <RoamIcon name={glyph} size={16} /> : Icon ? <Icon className="size-3.5" /> : null;
  return (
    <section aria-label={label} className={cn("roam-widget @container relative overflow-hidden rounded-3xl border border-border bg-card shadow-widget", PHONE_V2 && "max-lg:rounded-4xl", className)}>
      <header className={cn("flex items-center gap-3 px-4 pt-4 @[34rem]:px-[1.125rem]", PHONE_V2 && "max-lg:px-[1.125rem] max-lg:pt-[1.125rem]")}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", CHIP[tone], PHONE_V2 && "max-lg:hidden")} aria-hidden>
          {glyph ? <RoamIcon name={glyph} size={26} /> : Icon ? <Icon className="size-5" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className={cn("eyebrow truncate", PHONE_V2 && "max-lg:flex max-lg:items-center max-lg:gap-1.5 max-lg:text-coral-ink")}>
              {PHONE_V2 && eyebrowIcon && <span className="hidden shrink-0 max-lg:inline-flex" aria-hidden>{eyebrowIcon}</span>}
              <span className={cn(PHONE_V2 && "max-lg:truncate")}>{eyebrow}</span>
            </p>
          )}
          <h3 className={cn("font-display text-xl leading-6 font-medium tracking-[-0.012em] text-balance", PHONE_V2 && "max-lg:mt-0.5 max-lg:text-widget")}>{title}</h3>
        </div>
        {status && <div className="flex shrink-0 items-center gap-2 @max-[34rem]:hidden">{status}</div>}
      </header>
      {status && <div className={cn("flex flex-wrap items-center gap-2 px-4 pt-2.5 @[34rem]:hidden", PHONE_V2 && "max-lg:px-[1.125rem]")}>{status}</div>}
      {hero}
      {children}
      {(foot || action) && <WidgetFoot foot={foot} action={action} />}
    </section>
  );
}

/** The foot of a widget: a one-line caveat on the left, the one next step on the right. */
export function WidgetFoot({ foot, action }: { foot?: ReactNode; action?: ReactNode }) {
  return (
    <footer className={cn("mt-1 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 @[34rem]:px-[1.125rem]", PHONE_V2 && "max-lg:bg-transparent max-lg:px-[1.125rem] max-lg:py-3.5")}>
      {foot && <div className="flex min-w-0 flex-1 items-start gap-1.5 text-xs leading-[1.35] text-muted-foreground">{foot}</div>}
      {action && <div className="shrink-0 has-[[data-wide]]:w-full">{action}</div>}
    </footer>
  );
}

/** The tinted band that holds the widget's single figure or visual. */
export function WidgetHero({ tone = "coral", tinted = false, className, children }: { tone?: WidgetTone; /** Phone redesign: the band keeps its colour only where the colour says something (weather's sky, a budget's state). Otherwise it is a quiet well. */ tinted?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mx-4 mt-3.5 rounded-xl p-4 @[34rem]:mx-[1.125rem] @[34rem]:px-[1.375rem] @[34rem]:py-[1.125rem]",
        HERO[tone],
        PHONE_V2 && "max-lg:mx-[1.125rem] max-lg:rounded-2xl",
        PHONE_V2 && !tinted && "max-lg:border max-lg:border-border max-lg:bg-surface max-lg:bg-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The big number: a price, a temperature, a duration. */
export function WidgetFigure({ children, unit, className }: { children: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-baseline gap-1.5", className)}>
      <FitText className="font-display text-[3rem] leading-[1] font-medium tracking-[-0.04em] tabular-nums @[34rem]:text-[3.5rem]">{children}</FitText>
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
      <div className="min-w-0 flex-1 @[34rem]:flex-none @[34rem]:basis-[34%]">
        <p className="truncate text-[0.9375rem] leading-snug font-medium">{title}</p>
        {detail && <p className="truncate text-xs leading-snug text-muted-foreground">{detail}</p>}
      </div>
      {mid && <div className="hidden min-w-0 flex-1 @[34rem]:block">{mid}</div>}
      {value && <div className="shrink-0 text-right">{value}</div>}
    </>
  );
  const cls = cn("flex items-center gap-3.5 px-4 py-3 @[34rem]:px-[1.125rem]", onClick && "w-full text-left transition-colors hover:bg-accent/40", className);
  return onClick ? <button type="button" onClick={onClick} aria-label={label} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

/** A value on a row's right edge: a figure and an optional small line under it. */
export function RowValue({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <p className="font-display text-lg leading-tight font-medium tabular-nums">{children}</p>
      {sub && <p className="text-[0.71875rem] max-lg:text-xs leading-tight text-muted-foreground tabular-nums">{sub}</p>}
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
export function WidgetAction({ children, onClick, href, quiet = false, arrow = true, label, wide = false }: { children: ReactNode; onClick?: () => void; href?: string; quiet?: boolean; arrow?: boolean; label?: string; /** The one step of the widget, stretched across its foot. */ wide?: boolean }) {
  const cls = cn(quiet ? ACTION_QUIET : ACTION, PHONE_V2 && "max-lg:h-11", wide && "w-full");
  const inner = (<>{children}{arrow && <ArrowUpRight className="size-4" aria-hidden />}</>);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label} data-wide={wide || undefined} className={cls}>{inner}</a>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} data-wide={wide || undefined} className={cls}>{inner}</button>
  );
}
