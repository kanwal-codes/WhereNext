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
import { ArrowRight, ArrowUpRight, Check, Copy, Info, Map as MapIcon, Star, type LucideIcon } from "lucide-react";
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
/** A card row. An overflow-x scroller also clips vertically, which sliced off the cards' long shadows and
 *  their 3px hover lift as a hard line. The padding below gives that shadow room to fall; the matching negative
 *  margin hands the room back, so the layout is unchanged. */
export const rail = "flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain no-scrollbar -mx-3 px-3 -mt-2 pt-2 -mb-10 pb-10 scroll-px-3";
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
      {done ? <Check key="done" className="settle-in size-4 text-positive" aria-hidden /> : <Copy className="size-4" aria-hidden />}
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
export function SectionHeader({ title, count, onSeeAll, onMap }: { title?: string; /** How many are in the row: a narrow column shows one card and a sliver of the next, so say how many there are. */ count?: number; onSeeAll?: () => void; onMap?: () => void }) {
  if (!title && !onSeeAll && !onMap) return null;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      {title ? (
        <h3 className={cn(type.section, "min-w-0 truncate")}>
          {title}
          {count != null && count > 1 && <span className="ml-2 font-normal text-muted-foreground tabular-nums">{count}</span>}
        </h3>
      ) : <span />}
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

/** Joins short facts with a middle dot, skipping the empty ones. The dot belongs to the item after it and sits in a
 *  gutter that the clipped wrapper hides at the start of every line, so a fact that wraps never begins with a
 *  stranded "·". */
export function Meta({ items, className }: { items: Array<ReactNode | null | undefined | false>; className?: string }) {
  const shown = items.filter((item): item is ReactNode => item !== null && item !== undefined && item !== false && item !== "");
  if (shown.length === 0) return null;
  return (
    <p className={cn(type.meta, "overflow-hidden", className)}>
      <span className="-ml-3 flex flex-wrap items-center gap-y-0.5">
        {shown.map((item, i) => (
          <span key={i} className="relative inline-flex items-center pl-3 before:absolute before:left-0 before:w-3 before:text-center before:opacity-50 before:content-['·']">
            {item}
          </span>
        ))}
      </span>
    </p>
  );
}

/** Photo stand-in: the app's warm wash (coral glow above, lagoon haze below) with the kind of thing drawn in a small lit tile, so a missing photo reads as designed and matches the Overview's tiles. */
export function MediaFallback({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div
      className={cn("relative isolate grid place-items-center overflow-hidden bg-surface", className)}
      style={{ backgroundImage: "radial-gradient(90% 85% at 18% 12%, color-mix(in oklab, var(--coral) 17%, transparent), transparent 66%), radial-gradient(80% 70% at 88% 100%, color-mix(in oklab, var(--lagoon) 10%, transparent), transparent 70%)" }}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-background/75 text-coral-ink shadow-soft ring-1 ring-border/60">
        <Icon className="size-6" strokeWidth={1.5} aria-hidden />
      </span>
    </div>
  );
}

const formatters = new Map<string, Intl.NumberFormat>();
/** "CA$97", "€230", "US$48.20" — the symbol, never a bare code, and cents only when there are cents. */
export function money(value: number | string, currency: string, apart = false): string {
  const amount = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  const whole = Number.isInteger(amount);
  const key = `${currency}|${whole}|${apart}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      // `apart`: "en" writes US dollars as a bare "$", which a Canadian reads as their own; en-CA writes "US$" (CAD is "CA$" in "en" already).
      formatter = new Intl.NumberFormat(apart && currency === "USD" ? "en-CA" : "en", { style: "currency", currency, currencyDisplay: "symbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
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
export const CardOpenOverlay = ({ label, onOpen, href }: { label: string; onOpen: () => void; /** With a real destination the overlay is a link, so a modified click still opens a new tab. */ href?: string }) => {
  // A mouse-only target over the whole card: the card's own Details button is the keyboard and screen-reader path,
  // so this one stays out of the tab order and the accessibility tree (it used to be a second, duplicate tab stop).
  // No tint of its own: it sits above the card's unpositioned text and photo in paint order, so a hover fill here washed them out. The card's lift and shadow (`card-lift`) are its hover.
  const className = "absolute inset-0 z-0 rounded-2xl focus-visible:outline-none";
  if (href) {
    return (
      <a
        href={href}
        aria-label={label}
        tabIndex={-1}
        aria-hidden="true"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
          event.preventDefault();
          onOpen();
        }}
        className={className}
      />
    );
  }
  return <button type="button" aria-label={label} tabIndex={-1} aria-hidden="true" onClick={onOpen} className={className} />;
};

/** The rating every place card shows: a coral star, the score, and a compact count. One shape on every screen. */
export function RatingMeta({ rating, count }: { rating: number; count?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="size-3.5 fill-current text-coral" aria-hidden />
      <span className="font-medium text-foreground tabular-nums">{rating.toFixed(1)}</span>
      {count ? <span className="tabular-nums">({compactCount(count)})</span> : null}
    </span>
  );
}

/** The check in a card's corner while the compare picker is on. */
export const CompareMark = ({ selected }: { selected: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full border-2 shadow-sm transition-colors",
      selected ? "border-coral bg-coral text-white" : "border-white bg-black/25 text-transparent",
    )}
  >
    <Check className="size-3.5" strokeWidth={3} />
  </span>
);

/** The "open this in the side panel" control every card kind uses. */
export const DetailsButton = ({ onClick, children = "Details", label, className }: { onClick: () => void; children?: ReactNode; /** What the details are of, so ten "Details" buttons in a thread are told apart. */ label?: string; className?: string }) => (
  <button type="button" data-details="" className={cn(controlSecondary, className)} onClick={onClick} aria-label={label}>
    {children} <ArrowUpRight className="size-3.5" aria-hidden />
  </button>
);

/** Card photo: 16:10, resolves out of a blur, and falls back to the kind's own stand-in if it is missing or fails to load. */
export function CardMedia({ src, alt, fallback }: { src?: string | null; alt: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  // The tinted well shows while the photo is on its way (photos come through our proxy and can take a second);
  // without it the top of every card was blank white until the picture faded in.
  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-muted">
      <BlurImage src={src} alt={alt} width={416} height={260} onError={() => setFailed(true)} className="size-full object-cover" />
    </div>
  );
}

/**
 * The anatomy every entity card shares (place, stay, event, and whatever comes next):
 * photo · title · one meta line · optional key fact · badges · extra · actions pinned to the foot.
 * A card fills the slots its data has; the order and spacing never change between kinds.
 */
export function EntityCard({ label, onOpen, href, className, media, glyph: Glyph, title, meta, fact, badges, extra, actions, alone = false, compact = false }: {
  label: string;
  onOpen?: () => void;
  /** A real destination for the whole-card click, so it behaves as a link (new tab, copy address). */
  href?: string;
  className?: string;
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
  /** The narrow lane version (a ~200px card in a side-panel rail): photo, title and one meta line, nothing else. Same surface, same hover. */
  compact?: boolean;
}) {
  return (
    <article data-tappable={onOpen ? "" : undefined} className={cn(surface, "card-lift group relative flex h-full flex-col", className)}>
      {onOpen && <CardOpenOverlay label={label} onOpen={onOpen} href={href} />}
      {/* The photo is part of the tap target: it sits above the overlay in paint order, so it hands every touch down to it. */}
      {media && <div className="pointer-events-none">{media}</div>}
      <div className={cn("flex flex-1 flex-col", compact ? "gap-1 p-3" : "gap-2 p-4")}>
        {(() => {
          const tile = !media && Glyph && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink" aria-hidden>
              <Glyph className="size-[18px]" />
            </span>
          );
          // Two title lines and one meta line are always reserved in a row of cards, so the figure below starts at the same height on every card.
          const heading = (
            <>
              <h4 className={cn(compact ? "font-display text-sm font-semibold leading-snug tracking-[-0.01em]" : type.title, "line-clamp-2", !alone && !compact && "min-h-[2lh]")}>{title}</h4>
              {meta && <div className={cn("text-xs leading-snug", !alone && !compact && "min-h-[1lh]")}><Meta items={meta} /></div>}
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
        {!compact && fact}
        {!compact && badges && <div className="flex flex-wrap gap-1.5">{badges}</div>}
        {!compact && extra}
        {!compact && actions && <div className="entity-actions relative z-10 mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-2">{actions}</div>}
      </div>
    </article>
  );
}

/** The header of a list-like block (flights, budget, itinerary, comparison): icon · title · meta … actions. */
export function BlockHeader({ icon: Icon, title, meta, actions }: { icon: LucideIcon; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-start gap-x-2 gap-y-0.5">
        <Icon className="mt-[3px] size-4 shrink-0 text-coral" aria-hidden />
        <h3 className={cn(type.title, "flex min-w-0 flex-wrap items-center gap-x-1.5")}>{title}</h3>
        {/* On a phone the note goes under the title instead of squeezing it onto two lines. */}
        {meta && <span className={cn(type.meta, "mt-[3px] max-sm:order-last max-sm:mt-0 max-sm:basis-full max-sm:pl-6")}>{meta}</span>}
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
