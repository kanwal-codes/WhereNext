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
type Action = { icon: LucideIcon; label: string; href: string; external?: boolean; /** A second, quieter line (the number, the site) in the `bar` variant. */ hint?: string };

/** The few numbers a thing is judged on — rating, price, open now — in one bordered strip with equal columns. */
export function FactStrip({ facts, className, variant = "default" }: { facts: Array<Maybe<Fact>>; className?: string; /** `hero`: big numerals under quiet small-caps labels, for a place's headline facts. */ variant?: "default" | "hero" }) {
  const shown = present(facts);
  if (shown.length === 0) return null;
  if (variant === "hero") {
    return (
      <dl className={cn("grid grid-flow-col auto-cols-fr rounded-3xl border border-border bg-card shadow-soft", className)}>
        {shown.map((fact) => (
          <div key={fact.label} className="relative min-w-0 px-3 py-4 before:absolute before:inset-y-4 before:left-0 before:w-px before:bg-border first:before:hidden sm:px-5">
            <dt className="eyebrow">{fact.label}</dt>
            <dd className={cn("mt-2.5 flex min-w-0 items-center gap-1.5 font-display text-2xl leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[1.75rem]", fact.tone === "positive" && "text-positive", fact.tone === "caution" && "text-caution")}>
              {fact.value}
            </dd>
            {fact.note && <dd className="mt-2.5 text-xs leading-snug text-muted-foreground">{fact.note}</dd>}
          </div>
        ))}
      </dl>
    );
  }
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
          {fact.note && <dd className="daisy-stat-desc text-xs leading-snug break-words whitespace-normal text-muted-foreground opacity-100">{fact.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const press = "transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.96]";
/** The first action is the thing to do (a wide ink pill); each of the rest takes its own shape and tint, so a row of three reads as three different things and not three copies of one button. */
const MAIN = cn("h-12 min-w-0 flex-1 gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.14),0_6px_14px_-8px_oklch(0.2_0.012_65/0.55)] hover:bg-primary/88", press, ring);
const OTHERS = [
  cn("size-12 rounded-full bg-coral-soft text-coral-ink hover:shadow-soft", press, ring),
  cn("size-12 rounded-2xl bg-lagoon-soft text-lagoon hover:shadow-soft", press, ring),
  cn("size-12 rounded-[1.15rem] bg-leaf-soft text-leaf hover:shadow-soft", press, ring),
] as const;

const BAR_TINT = ["bg-coral-soft text-coral-ink", "bg-leaf-soft text-leaf", "bg-lagoon-soft text-lagoon"] as const;

/** A row of quick actions (Directions, Call, Website…): the first a wide pill with its label, the others round or rounded-square icon buttons (named for screen readers and as a tooltip). */
export function QuickActions({ actions, variant = "row" }: { actions: Array<Maybe<Action>>; /** `bar`: one card of equal cells, each a tinted round icon over its label; quieter than the main action above it. */ variant?: "row" | "bar" }) {
  const shown = present(actions);
  if (shown.length === 0) return null;
  if (variant === "bar") {
    const single = shown.length === 1;
    return (
      <div className={cn("grid grid-flow-col auto-cols-fr divide-x divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft")}>
        {shown.map(({ icon: Icon, label, href, external, hint }, i) => (
          <a
            key={label}
            href={href.startsWith("tel:") ? href : safeHref(href)}
            {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            className={cn("group min-w-0 transition-[background-color,transform] duration-200 ease-out hover:bg-accent/60 active:scale-[0.985]", single ? "flex items-center justify-center gap-3.5 px-5 py-4" : "flex flex-col items-center gap-2.5 px-3 py-4", ring)}
          >
            <span className={cn("grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-105", BAR_TINT[i % BAR_TINT.length])}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className={cn("min-w-0 max-w-full", single ? "text-left" : "text-center")}>
              <span className="block text-sm leading-tight font-medium">{label}</span>
              {hint && <span className="mt-1 block truncate text-xs leading-tight text-muted-foreground">{hint}</span>}
            </span>
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      {shown.map(({ icon: Icon, label, href, external }, i) => {
        const main = i === 0;
        return (
          <a
            key={label}
            href={href.startsWith("tel:") ? href : safeHref(href)}
            {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            title={main ? undefined : label}
            className={cn("inline-flex shrink-0 items-center justify-center", main ? cn(MAIN, shown.length === 1 && "flex-none") : OTHERS[(i - 1) % OTHERS.length])}
          >
            <Icon className={main ? "size-[18px]" : "size-5"} aria-hidden />
            {main ? label : <span className="sr-only">{label}</span>}
          </a>
        );
      })}
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
