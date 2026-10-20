"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { MapPin, Star, type LucideIcon } from "lucide-react";
import { useMediaQuery } from "@/lib/use-media-query";
import { RoamIcon } from "@/features/roam/ui/RoamIcon";
import { BlurImage } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { hoursPill, type HoursPill } from "@/lib/place-hours";
import { isFoodPlace, priceLabel } from "@/lib/places-ui";
import { CardOpenOverlay } from "./ui";

/**
 * The cinematic card every place, event and stay uses, in Discover and in Roam's replies: the photo fills the
 * card, a warm fade carries the title and a few frosted pills, and the one thing to do with it sits at the
 * bottom right (a round add button, tickets, details), so no corner of the card is left empty.
 *
 * The whole card opens (`onOpen`); anything interactive in `action` sits above that tap target.
 */

const SCRIM =
  "linear-gradient(to top, rgb(20 15 12 / 0.94) 0%, rgb(20 15 12 / 0.62) 36%, rgb(20 15 12 / 0) 64%), linear-gradient(to bottom, rgb(20 15 12 / 0.4) 0%, rgb(20 15 12 / 0) 24%)";

const pillBase = "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular-nums";
const PILL_TONE = {
  glass: "bg-white/95 text-ink shadow-[0_1px_2px_oklch(0.2_0.012_65/0.18)]",
  positive: "bg-white/95 text-ink shadow-[0_1px_2px_oklch(0.2_0.012_65/0.18)]",
  solid: "bg-white text-ink",
} as const;

/** A frosted pill on the photo. */
export function CinePill({ icon: Icon, iconClassName, tone = "glass", children, className }: { icon?: LucideIcon; iconClassName?: string; tone?: keyof typeof PILL_TONE; children: ReactNode; className?: string }) {
  return (
    <span className={cn(pillBase, PILL_TONE[tone], className)}>
      {Icon && <Icon className={cn("size-3.5 shrink-0", tone === "positive" && "text-positive", iconClassName)} aria-hidden />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** The rating pill: star, score, and how many people gave it. */
export function CineRating({ rating, count, outOf }: { rating: number; count?: string | null; outOf?: string }) {
  // The star is the pill's own icon (centred beside the text), not a glyph inside it, which sat a pixel low on the baseline.
  return (
    <CinePill icon={Star} iconClassName="fill-current text-coral" className="gap-1 pl-2">
      {rating.toFixed(1)}
      {outOf && <span className="opacity-70">{outOf}</span>}
      {count ? <span className="opacity-70"> {count}</span> : null}
    </CinePill>
  );
}

/** Bottom left of a card that has no "why it fits" line: where it is, street and area, so the corner is never empty. */
export function CineAddress({ address }: { address: string }) {
  return (
    <p className="flex gap-1.5 text-xs leading-[1.35] text-white/80">
      <MapPin className="mt-px size-4 shrink-0 text-coral-soft" aria-hidden />
      <span className="line-clamp-2">{address.split(",").slice(0, 2).join(",").trim()}</span>
    </p>
  );
}

/**
 * The floating pills at a place card's top right: whether it is open (and when it closes, or when it opens next) and,
 * for somewhere you eat or drink, what it costs. Each shows only when there is something to say. The hours depend on
 * the clock, so they are worked out after the page is on screen (the server's answer would differ from the browser's).
 */
export function PlaceFloatingPills({ place, extra }: { place: { openNow?: boolean; openingHours?: readonly string[]; longitude?: number; priceLevel?: string; category?: string | null }; extra?: ReactNode }) {
  const [hours, setHours] = useState<HoursPill | null>(null);
  useEffect(() => setHours(hoursPill(place.openNow, place.openingHours, place.longitude)), [place.openNow, place.openingHours, place.longitude]);
  const price = isFoodPlace(place.category) ? priceLabel(place.priceLevel) : null;
  if (!hours && !price && !extra) return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {hours && (
        <CinePill tone={hours.open ? "positive" : "glass"}>
          <span aria-hidden className={cn("mr-0.5 inline-block size-1.5 rounded-full", hours.open ? "bg-positive" : "bg-muted-foreground/50")} />
          {hours.label}
        </CinePill>
      )}
      {price && <CinePill>{price}</CinePill>}
      {extra}
    </div>
  );
}

/** A small calendar tile for an event's day. */
export function CineDate({ month, day }: { month: string; day: string }) {
  return (
    <span className="inline-flex w-[3.25rem] flex-col items-center rounded-2xl border border-white/25 bg-white/14 py-1.5 backdrop-blur-md backdrop-saturate-150" aria-hidden>
      <span className="text-[0.625rem] max-lg:text-xs leading-3 font-semibold tracking-[0.14em] text-coral-soft uppercase">{month}</span>
      <span className="font-display text-2xl leading-6 font-medium tabular-nums">{day}</span>
    </span>
  );
}

/** The round control that closes the card: a coral orb (add) or a white one (open, tickets). */
export const CINE_ORB = "grid size-12 shrink-0 place-items-center rounded-full transition-[transform,filter] duration-200 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
export const CINE_ORB_CORAL = "bg-coral-fill text-coral-fill-foreground shadow-[0_10px_26px_oklch(0.64_0.175_36/0.5),inset_0_1px_0_oklch(1_0_0/0.35)] hover:brightness-105";
export const CINE_ORB_WHITE = "bg-white text-ink shadow-[0_6px_16px_oklch(0_0_0/0.35)] hover:brightness-95";
/** A white pill action ("Tickets"), for a card whose next step leads off the page. */
export const CINE_PILL_ACTION = "inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-5 text-sm font-semibold text-ink shadow-[0_6px_16px_oklch(0_0_0/0.35)] transition-[transform,filter] duration-200 ease-out hover:brightness-95 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function Backdrop({ src, alt, glyph: Glyph }: { src?: string | null; alt: string; glyph?: LucideIcon }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className="pointer-events-none absolute inset-0 bg-[oklch(0.2_0.012_60)]">
        <BlurImage src={src} alt={alt} width={640} height={800} onError={() => setFailed(true)} className="size-full object-cover" />
      </div>
    );
  }
  // No photo: a dark warm ground with the kind's own glyph, so the white type on it still reads.
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      style={{ backgroundImage: "radial-gradient(90% 70% at 20% 10%, color-mix(in oklab, var(--coral) 30%, transparent), transparent 70%), linear-gradient(160deg, oklch(0.34 0.02 55), oklch(0.2 0.012 60))" }}
    >
      {Glyph && <Glyph className="-mt-10 size-14 text-white/25" strokeWidth={1.25} aria-hidden />}
    </div>
  );
}


/** What a phone list row shows in place of the photo card: a line of facts, an address or venue line, and its two controls. */
export type CineRowContent = { meta?: ReactNode; sub?: ReactNode; save?: ReactNode; action?: ReactNode };

/**
 * A card as a row, for a long list on a phone: a square photo, the name and a line or two of facts, and the controls
 * on the right. About six fit a screen, where the photo card shows two. The whole row opens, as the card does.
 */
function CineRow({ label, onOpen, href, src, alt, glyph: Glyph, eyebrow, title, row, selected, overlay }: { label: string; onOpen?: () => void; href?: string; src?: string | null; alt: string; glyph?: LucideIcon; eyebrow?: ReactNode; title: ReactNode; row: CineRowContent; selected: boolean; overlay?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  return (
    <article data-tappable={onOpen ? "" : undefined} className={cn("card-lift group relative isolate flex w-full items-center gap-4 overflow-hidden rounded-4xl bg-card p-3 pr-3.5 shadow-float ring-1 ring-black/[0.05]", selected && "ring-2 ring-coral")}>
      {onOpen && <CardOpenOverlay label={label} onOpen={onOpen} href={href} />}
      <div className="pointer-events-none relative h-[7.5rem] w-24 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-soft ring-1 ring-black/[0.06]">
        {src && !failed ? (
          <BlurImage src={src} alt={alt} width={240} height={300} onError={() => setFailed(true)} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">{Glyph && <Glyph className="size-8 text-muted-foreground/50" strokeWidth={1.25} aria-hidden />}</div>
        )}
      </div>
      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col justify-center py-0.5">
        {eyebrow && <p className="truncate text-[0.625rem] max-lg:text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">{eyebrow}</p>}
        <h4 className="mt-1 line-clamp-2 font-display text-xl leading-[1.15] font-medium tracking-[-0.02em] text-balance">{title}</h4>
        <span aria-hidden className="my-2 h-px w-8 bg-gradient-to-r from-coral/80 to-transparent" />
        {row.meta && <div className="truncate text-xs text-muted-foreground tabular-nums">{row.meta}</div>}
        {row.sub && <div className="mt-0.5 truncate text-xs text-muted-foreground/80">{row.sub}</div>}
      </div>
      {(row.save || row.action) && (
        <div className="pointer-events-auto relative z-10 flex h-[7.5rem] shrink-0 flex-col items-center justify-between">
          <div>{row.save}</div>
          <div>{row.action}</div>
        </div>
      )}
      {overlay}
    </article>
  );
}

export function CineCard({
  label, onOpen, href, className, src, alt, glyph, topLeft, topRight, save, eyebrow, title, meta, pills, why, foot, action, compact = false, wide = false, selected = false, overlay, row,
}: {
  label: string;
  onOpen?: () => void;
  href?: string;
  className?: string;
  src?: string | null;
  /** The photo's description (usually the name). */
  alt: string;
  /** Stands in on the dark ground when there is no photo. */
  glyph?: LucideIcon;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  /** The heart: pinned to the top right corner, with `topRight` stacked under it. */
  save?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Compact only: the single line under the title. */
  meta?: ReactNode;
  pills?: ReactNode;
  /** One sentence on why this fits the trip, with a sparkle. */
  why?: ReactNode;
  /** Bottom left, when there is no `why`: a price, a seller. */
  foot?: ReactNode;
  /** Bottom right: the round add button, "Tickets", details. */
  action?: ReactNode;
  /** A ~200px card in a side-panel rail: photo, title, one line. */
  compact?: boolean;
  /** In a long list on a phone: shorter, so a screen shows more than one. */
  wide?: boolean;
  selected?: boolean;
  /** Anything pinned over the whole card (the compare mark). */
  overlay?: ReactNode;
  /** With `wide`: on a phone the card becomes this compact row. */
  row?: CineRowContent;
}) {
  const phone = useMediaQuery("(max-width: 639.98px)");
  if (wide && row && phone) return <CineRow label={label} onOpen={onOpen} href={href} src={src} alt={alt} glyph={glyph} eyebrow={eyebrow} title={title} row={row} selected={selected} overlay={overlay} />;
  const hasBottom = !compact && (why || foot || action);
  return (
    <article
      data-tappable={onOpen ? "" : undefined}
      className={cn(
        "card-lift group relative isolate h-full w-full overflow-hidden rounded-3xl bg-[oklch(0.2_0.012_60)] text-white shadow-soft",
        compact ? "aspect-[4/5]" : wide ? "aspect-[4/3] sm:aspect-[3/4]" : "aspect-[3/4]",
        selected && "ring-2 ring-coral",
        className,
      )}
    >
      {onOpen && <CardOpenOverlay label={label} onOpen={onOpen} href={href} />}
      <Backdrop src={src} alt={alt} glyph={glyph} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: SCRIM }} />
      <div className={cn("pointer-events-none relative z-[1] flex h-full min-h-0 flex-col justify-between", compact ? "p-2.5" : "p-3.5")}>
        <div className="flex items-start justify-between gap-2">
          {/* As tall as the heart beside it, so the rating pill and the heart share a centre line. */}
          <div className={cn("shrink-0", save && (compact ? "flex h-8 items-center" : "flex h-10 items-center"))}>{topLeft}</div>
          <div className="flex min-w-0 flex-col items-end gap-1.5">{save}{topRight}</div>
        </div>
        <div className="min-w-0">
          {eyebrow && !compact && <p className="eyebrow truncate text-white/70!">{eyebrow}</p>}
          <h4 className={cn("font-display font-medium text-white text-balance", compact ? "line-clamp-2 text-[0.9375rem] leading-tight tracking-[-0.012em]" : "mt-1.5 line-clamp-2 text-2xl leading-[1.1] tracking-[-0.022em]")}>{title}</h4>
          {compact && meta && <div className="mt-1 truncate text-xs text-white/75">{meta}</div>}
          {!compact && pills && <div className="mt-3 flex flex-wrap gap-1.5">{pills}</div>}
          {hasBottom && (
            <>
              <div className="my-3 h-px bg-white/15" />
              <div className="flex min-h-12 items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {why ? (
                    <p className="flex gap-1.5 text-xs leading-[1.35] text-white/85">
                      <span className="mt-px shrink-0 text-coral-soft"><RoamIcon name="star" size={18} draw={false} /></span>
                      <span className="line-clamp-2">{why}</span>
                    </p>
                  ) : (
                    foot
                  )}
                </div>
                {action && <div className="pointer-events-auto relative z-10 shrink-0">{action}</div>}
              </div>
            </>
          )}
        </div>
      </div>
      {overlay}
    </article>
  );
}
