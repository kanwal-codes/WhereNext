"use client";

import { ArrowUpRight, BedDouble, Check, Star } from "lucide-react";
import { CardOpenOverlay, CompareMark, compactCount, money } from "@/features/conversation/ui/blocks/ui";
import { StayPhoto } from "@/features/stays/ui/MyStayCard";
import { PHONE_V2 } from "@/lib/phone-v2";
import { CINE_ORB, CINE_ORB_WHITE, CineCard, CinePill, CineRating } from "@/features/conversation/ui/blocks/CineCard";
import { cn } from "@/lib/utils";

export type StayCardData = {
  hotelId: string;
  name: string;
  thumbnail: string | null;
  stars: number | null;
  rating: number | null;
  reviewCount?: number | null;
  nightlyAmount: number;
  totalAmount?: number | null;
  currency: string;
  boardName?: string | null;
  refundable?: boolean;
  propertyType?: string | null;
};

/** Phone redesign: a stay as a wide photo with its name, score and price under it, like the Roam stays widget. */
function PhoneStayCard({ stay, href, onOpen, locked, comparing, selected }: { stay: StayCardData; href: string; onOpen: () => void; locked: boolean; comparing: boolean; selected: boolean }) {
  const kind = stay.propertyType && stay.propertyType !== "Hotel" ? stay.propertyType : null;
  const rated = typeof stay.rating === "number" && stay.rating > 0;
  const line = [kind, typeof stay.stars === "number" && stay.stars > 0 ? `${stay.stars}-star` : null, stay.boardName].filter(Boolean).join(" · ");
  return (
    <article data-tappable className="group relative isolate">
      <CardOpenOverlay label={`Open ${stay.name}`} onOpen={onOpen} href={href} />
      <div className={cn("relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted", locked && "ring-2 ring-positive/60", selected && "ring-2 ring-coral")}>
        <StayPhoto src={stay.thumbnail} alt="" className="photo-grade absolute inset-0 h-full w-full object-cover" />
        {(locked || stay.refundable) && (
          <span className="photo-chip absolute bottom-3 left-3 gap-1.5">
            <Check className="size-3.5 text-leaf" aria-hidden />
            {locked ? "Your stay" : "Free cancellation"}
          </span>
        )}
        {comparing && <CompareMark selected={selected} />}
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-snug font-medium tracking-[-0.015em] text-balance">{stay.name}</h3>
          <p className="mt-0.5 flex items-center gap-x-1.5 text-sm whitespace-nowrap text-muted-foreground">
            {rated && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <Star className="size-3.5 fill-coral text-coral" aria-hidden />
                {stay.rating!.toFixed(1)}{stay.reviewCount ? ` · ${compactCount(stay.reviewCount)}` : ""}
              </span>
            )}
            {rated && line ? <span aria-hidden className="shrink-0">·</span> : null}
            {line && <span className="min-w-0 truncate">{line}</span>}
          </p>
        </div>
        {stay.nightlyAmount > 0 ? (
          <p className="shrink-0 text-right">
            <span className="block font-display text-lg leading-snug font-medium tabular-nums">{money(stay.nightlyAmount, stay.currency)}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">{stay.totalAmount ? `${money(stay.totalAmount, stay.currency)} total` : "/ night"}</span>
          </p>
        ) : (
          <p className="shrink-0 text-right text-xs text-muted-foreground">Price unavailable</p>
        )}
      </div>
    </article>
  );
}

/**
 * A stay, wherever it is listed (Roam, Discover, the Stay page): the same cinematic `CineCard`, so "4-star", the guest score,
 * "CA$230 / night" and the details button look identical on every screen. Only its state differs: the
 * stay the group has locked, and the compare picker.
 */
export function StayResultCard({ stay, href, onOpen, locked = false, comparing = false, selected = false, phoneRow = false }: { stay: StayCardData; href: string; onOpen: () => void; locked?: boolean; comparing?: boolean; selected?: boolean; /** A horizontal card on a phone (the Stay page's long list). */ phoneRow?: boolean }) {
  const kind = stay.propertyType && stay.propertyType !== "Hotel" ? stay.propertyType : null;
  const card = (
    <CineCard
      label={`Open ${stay.name}`}
      onOpen={onOpen}
      href={href}
      wide={phoneRow}
      selected={selected}
      className={cn(locked && "ring-2 ring-positive/60")}
      src={stay.thumbnail}
      alt={stay.name}
      glyph={BedDouble}
      topLeft={
        locked ? (
          <CinePill tone="positive" icon={Check}>Your stay</CinePill>
        ) : typeof stay.rating === "number" && stay.rating > 0 ? (
          <CineRating rating={stay.rating} outOf="/10" count={stay.reviewCount ? compactCount(stay.reviewCount) : undefined} />
        ) : undefined
      }
      eyebrow={[kind, typeof stay.stars === "number" && stay.stars > 0 ? `${stay.stars}-star` : null].filter(Boolean).join(" · ") || "Stay"}
      title={stay.name}
      pills={
        stay.boardName || stay.refundable ? (
          <>
            {stay.refundable && <CinePill tone="positive" icon={Check}>Free cancellation</CinePill>}
            {stay.boardName && <CinePill>{stay.boardName}</CinePill>}
          </>
        ) : undefined
      }
      foot={stay.nightlyAmount > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-[1.75rem] leading-none font-medium tracking-[-0.025em] tabular-nums">{money(stay.nightlyAmount, stay.currency)}</span>
          <span className="text-[0.8125rem] text-white/70">/ night</span>
          {stay.totalAmount ? <span className="w-full pt-0.5 text-xs text-white/60 tabular-nums">{money(stay.totalAmount, stay.currency)} total</span> : null}
        </p>
      ) : (
        <p className="text-[0.8125rem] text-white/75">Price unavailable for these dates</p>
      )}
      action={stay.nightlyAmount > 0 ? (
        <button type="button" onClick={onOpen} aria-label={`Rooms & details: ${stay.name}`} className={cn(CINE_ORB, CINE_ORB_WHITE)}>
          <ArrowUpRight className="size-5" aria-hidden />
        </button>
      ) : undefined}
      overlay={comparing ? <CompareMark selected={selected} /> : undefined}
      row={{
        meta: typeof stay.rating === "number" && stay.rating > 0 ? `${stay.rating.toFixed(1)}/10${stay.reviewCount ? ` · ${compactCount(stay.reviewCount)}` : ""}${stay.refundable ? " · Free cancellation" : ""}` : stay.refundable ? "Free cancellation" : undefined,
        sub: stay.nightlyAmount > 0 ? <span><b className="font-display text-base font-medium text-foreground tabular-nums">{money(stay.nightlyAmount, stay.currency)}</b> / night</span> : "Price unavailable for these dates",
        action: stay.nightlyAmount > 0 ? (
          <button type="button" onClick={onOpen} aria-label={`Rooms & details: ${stay.name}`} className="grid size-9 place-items-center rounded-full border border-border bg-background transition-transform active:scale-95">
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        ) : undefined,
      }}
    />
  );
  if (!(PHONE_V2 && phoneRow)) return card;
  return (
    <>
      <div className="lg:hidden"><PhoneStayCard stay={stay} href={href} onOpen={onOpen} locked={locked} comparing={comparing} selected={selected} /></div>
      <div className="max-lg:hidden">{card}</div>
    </>
  );
}
