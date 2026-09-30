"use client";

/**
 * Building blocks for the cards Roam puts in a reply. One place for the type roles, spacing,
 * radius and status colours, so every block reads as part of the same product.
 *
 * Roles (Figtree body, Outfit display): 12 meta / label · 14 body · 16 title · 18 section · 24 figure.
 * Spacing: 4 / 8 / 12 / 16 (card padding 16, section gap 12). Radius: cards `rounded-2xl`,
 * controls `rounded-xl`, the primary CTA a pill (the app's documented scale in globals.css).
 * Status colour is `positive` / `caution` only where meaning matters; coral stays the one accent.
 */
import React, { useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, Copy, Info, Map as MapIcon, type LucideIcon } from "lucide-react";
import { BlurImage } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

export const type = {
  title: "font-display text-base font-semibold leading-snug tracking-[-0.01em]",
  section: "font-display text-lg font-semibold leading-snug tracking-[-0.015em]",
  body: "text-sm leading-normal",
  meta: "text-xs leading-snug text-muted-foreground",
  figure: "font-display text-2xl font-semibold leading-none tabular-nums tracking-[-0.02em]",
  num: "font-semibold tabular-nums",
} as const;

/** The card surface: one border, one shadow, one radius. */
export const surface = "rounded-2xl border border-border bg-card shadow-soft";
/** Carousel card width — every card kind shares it so rows line up. */
export const CARD_W = "w-[16.25rem]";
/** Horizontal card rail: the peeking next card is the affordance. */
export const rail = "flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-2";
/** Full-collection grid in the side panel: reflows to the panel's own width. */
export const grid = "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3";
/** A secondary control: soft rectangle, 32px tall, 44px effective hit area. */
export const controlSecondary =
  "relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-ink-soft transition-[transform,color,border-color,background-color] hover:border-primary/40 hover:text-foreground active:scale-[0.97] before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";
/** A text action ("Tickets", "See all"): no box, generous invisible hit area. */
export const textAction =
  "relative inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 transition-colors hover:text-coral hover:underline after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']";

/** An icon-only control: 32px visible, 44px effective hit area. */
export const controlGhost =
  "relative inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-95 before:absolute before:-inset-1.5 before:content-['']";

/** Copy a reply; flips to a check for a moment so the click is acknowledged. */
/** `tabbable` is false for older replies: a long thread otherwise has a Copy stop after every answer (still clickable, just not in the tab order). */
export function CopyButton({ text, tabbable = true }: { text: string; tabbable?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : "Copy reply"}
      title="Copy reply"
      tabIndex={tabbable ? undefined : -1}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={controlGhost}
    >
      {done ? <Check className="size-4 text-positive" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </button>
  );
}

type Tone = "neutral" | "positive" | "caution" | "brand";
const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-positive-soft text-positive",
  caution: "bg-caution-soft text-caution",
  brand: "bg-coral-soft text-coral-ink",
};

/** A small status or fit marker. daisyUI supplies the structure; the app's tokens supply the colour. */
export function Badge({ tone = "neutral", icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn("daisy-badge daisy-badge-soft h-6 max-w-full gap-1 border-0 px-2 text-xs font-medium", TONE[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** The "show this on the map" control every list, plan and route card uses. */
export const MapButton = ({ onClick, children = "Map", className }: { onClick: () => void; children?: ReactNode; className?: string }) => (
  <button type="button" className={cn(controlSecondary, className)} onClick={onClick}>
    <MapIcon className="size-3.5" aria-hidden /> {children}
  </button>
);

/** Section heading for a group of cards, with an optional "Map" and "See all". */
export function SectionHeader({ title, onSeeAll, onMap }: { title?: string; onSeeAll?: () => void; onMap?: () => void }) {
  if (!title && !onSeeAll && !onMap) return null;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      {title ? <h3 className={cn(type.section, "min-w-0 truncate")}>{title}</h3> : <span />}
      <div className="flex shrink-0 items-center gap-3">
        {onMap && <MapButton onClick={onMap} />}
        {onSeeAll && (
          <button
            type="button"
            aria-label={title ? `See all ${title}` : "See all results"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSeeAll();
            }}
            className={textAction}
          >
            See all <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/** A quiet freshness / caveat line under a block. */
export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "caution" }) {
  return (
    <p role="note" className={cn("flex items-start gap-1.5 text-xs leading-snug", tone === "caution" ? "text-caution" : "text-muted-foreground")}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Joins short facts with a middle dot, skipping the empty ones. */
export function Meta({ items, className }: { items: Array<ReactNode | null | undefined | false>; className?: string }) {
  const shown = items.filter((item): item is ReactNode => item !== null && item !== undefined && item !== false && item !== "");
  if (shown.length === 0) return null;
  return (
    <p className={cn(type.meta, "flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      {shown.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="opacity-50">·</span>}
          {item}
        </span>
      ))}
    </p>
  );
}

/** Photo stand-in: a soft coral wash with a large faded glyph, so a missing photo reads as designed. */
export function MediaFallback({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("relative isolate grid place-items-center overflow-hidden bg-gradient-to-br from-coral-soft via-muted to-card text-coral/40", className)}>
      <Icon className="size-16" strokeWidth={1.25} aria-hidden />
    </div>
  );
}

const formatters = new Map<string, Intl.NumberFormat>();
/** "CA$97", "€230", "US$48.20" — the symbol, never a bare code, and cents only when there are cents. */
export function money(value: number | string, currency: string): string {
  const amount = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  const whole = Number.isInteger(amount);
  const key = `${currency}|${whole}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "symbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
    } catch {
      return `${amount} ${currency}`;
    }
    formatters.set(key, formatter);
  }
  return formatter.format(amount);
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** 78,359 → "78K", 962 → "962". */
export const compactCount = (n: number): string => (n >= 10_000 ? compact.format(n) : n.toLocaleString("en"));

/** "2026-11-26" → "Nov 26"; anything else is returned untouched. */
export function prettyDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
  const d = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/** "2026-11-26 to 2026-12-10" / "2026-11-26 → 2026-12-10" → "Nov 26 – Dec 10"; a single ISO date → "Nov 26". */
export function prettyDates(raw?: string | null): string {
  if (!raw) return "Not set";
  const isoDates = raw.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoDates && isoDates.length >= 2) return `${prettyDate(isoDates[0])} – ${prettyDate(isoDates[1])}`;
  if (isoDates && isoDates.length === 1 && raw.trim().length <= 12) return prettyDate(isoDates[0]) ?? raw;
  return raw;
}

/** A whole-card click target under the card's own controls (which sit on `relative z-10`). Keeps markup un-nested. */
export const CardOpenOverlay = ({ label, onOpen }: { label: string; onOpen: () => void }) => (
  // A mouse-only target over the whole card: the card's own Details button is the keyboard and screen-reader path,
  // so this one stays out of the tab order and the accessibility tree (it used to be a second, duplicate tab stop).
  <button
    type="button"
    aria-label={label}
    tabIndex={-1}
    aria-hidden="true"
    onClick={onOpen}
    className="absolute inset-0 z-0 rounded-2xl transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
  />
);

/** The "open this in the side panel" control every card kind uses. */
export const DetailsButton = ({ onClick, children = "Details", label }: { onClick: () => void; children?: ReactNode; /** What the details are of, so ten "Details" buttons in a thread are told apart. */ label?: string }) => (
  <button type="button" className={controlSecondary} onClick={onClick} aria-label={label}>
    {children} <ArrowUpRight className="size-3.5" aria-hidden />
  </button>
);

/** Card photo: 16:10, resolves out of a blur, and falls back to the kind's own stand-in if it is missing or fails to load. */
export function CardMedia({ src, alt, fallback }: { src?: string | null; alt: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return <BlurImage src={src} alt={alt} width={416} height={260} onError={() => setFailed(true)} className="aspect-[16/10] w-full rounded-t-2xl object-cover" />;
}

/**
 * The anatomy every entity card shares (place, stay, event, and whatever comes next):
 * photo · title · one meta line · optional key fact · badges · extra · actions pinned to the foot.
 * A card fills the slots its data has; the order and spacing never change between kinds.
 */
export function EntityCard({ label, onOpen, media, glyph: Glyph, title, meta, fact, badges, extra, actions, alone = false }: {
  label: string;
  onOpen?: () => void;
  /** The card's photo. Leave it out, and pass `glyph`, when no card in the list has one: a banner of nothing is wasted height. */
  media?: ReactNode;
  glyph?: LucideIcon;
  title: ReactNode;
  meta?: Array<ReactNode | null | undefined | false>;
  /** The one figure the card is about (a nightly price). */
  fact?: ReactNode;
  badges?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
  /** Not part of a row of cards, so there is no sibling to line up with: no reserved title or meta height. */
  alone?: boolean;
}) {
  return (
    <article className={cn(surface, "group relative flex h-full flex-col transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-lift")}>
      {onOpen && <CardOpenOverlay label={label} onOpen={onOpen} />}
      {media}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {(() => {
          const tile = !media && Glyph && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink" aria-hidden>
              <Glyph className="size-[18px]" />
            </span>
          );
          // Two title lines and one meta line are always reserved in a row of cards, so the figure below starts at the same height on every card.
          const heading = (
            <>
              <h4 className={cn(type.title, "line-clamp-2", !alone && "min-h-[2lh]")}>{title}</h4>
              {meta && <div className={cn("text-xs leading-snug", !alone && "min-h-[1lh]")}><Meta items={meta} /></div>}
            </>
          );
          return alone && tile ? (
            <div className="flex items-center gap-3">
              {tile}
              <div className="min-w-0 space-y-0.5">{heading}</div>
            </div>
          ) : (
            <>
              {tile}
              {heading}
            </>
          );
        })()}
        {fact}
        {badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
        {extra}
        {actions && <div className="relative z-10 mt-auto flex items-center gap-2 pt-2">{actions}</div>}
      </div>
    </article>
  );
}

/** The header of a list-like block (flights, budget, itinerary, comparison): icon · title · meta … actions. */
export function BlockHeader({ icon: Icon, title, meta, actions }: { icon: LucideIcon; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-40 items-start gap-2">
        <Icon className="mt-[3px] size-4 shrink-0 text-coral" aria-hidden />
        <h3 className={cn(type.title, "flex min-w-0 flex-wrap items-center gap-x-1.5")}>{title}</h3>
        {meta && <span className={cn(type.meta, "mt-[3px]")}>{meta}</span>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A segmented-control tab: the selected one is a solid fill (matching the selected filter chips), the rest quiet text. */
export const segmentTab = (selected: boolean) =>
  selected
    ? "daisy-tab-active bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground"
    : "text-muted-foreground hover:text-foreground";
