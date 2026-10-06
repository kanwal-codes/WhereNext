"use client";

import { ArrowUpRight, BedDouble, Check } from "lucide-react";
import { CompareMark, compactCount, money } from "@/features/conversation/ui/blocks/ui";
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

/**
 * A stay, wherever it is listed (Roam, Discover, the Stay page): the same cinematic `CineCard`, so "4-star", the guest score,
 * "CA$230 / night" and the details button look identical on every screen. Only its state differs: the
 * stay the group has locked, and the compare picker.
 */
export function StayResultCard({ stay, href, onOpen, locked = false, comparing = false, selected = false, phoneRow = false }: { stay: StayCardData; href: string; onOpen: () => void; locked?: boolean; comparing?: boolean; selected?: boolean; /** A horizontal card on a phone (the Stay page's long list). */ phoneRow?: boolean }) {
  const kind = stay.propertyType && stay.propertyType !== "Hotel" ? stay.propertyType : null;
  return (
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
      foot={
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-[1.75rem] leading-none font-medium tracking-[-0.025em] tabular-nums">{money(stay.nightlyAmount, stay.currency)}</span>
          <span className="text-[0.8125rem] text-white/70">/ night</span>
          {stay.totalAmount ? <span className="w-full pt-0.5 text-xs text-white/60 tabular-nums">{money(stay.totalAmount, stay.currency)} total</span> : null}
        </p>
      }
      action={
        <button type="button" onClick={onOpen} aria-label={`Rooms & details: ${stay.name}`} className={cn(CINE_ORB, CINE_ORB_WHITE)}>
          <ArrowUpRight className="size-5" aria-hidden />
        </button>
      }
      overlay={comparing ? <CompareMark selected={selected} /> : undefined}
    />
  );
}
