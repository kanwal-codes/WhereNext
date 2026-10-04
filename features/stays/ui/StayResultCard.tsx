"use client";

import { BedDouble, Check } from "lucide-react";
import { Badge, CardMedia, CompareMark, DetailsButton, EntityCard, MediaFallback, compactCount, money, type } from "@/features/conversation/ui/blocks/ui";
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
 * A stay, wherever it is listed (Roam, Discover, the Stay page): the same `EntityCard`, so "4-star", the guest score,
 * "CA$230 / night" and the Rooms & details button look identical on every screen. Only its state differs: the
 * stay the group has locked, and the compare picker.
 */
export function StayResultCard({ stay, href, onOpen, locked = false, comparing = false, selected = false }: { stay: StayCardData; href: string; onOpen: () => void; locked?: boolean; comparing?: boolean; selected?: boolean }) {
  const kind = stay.propertyType && stay.propertyType !== "Hotel" ? stay.propertyType : null;
  return (
    <EntityCard
      label={`Open ${stay.name}`}
      onOpen={onOpen}
      href={href}
      className={cn(selected && "ring-2 ring-coral", locked && "border-positive/40")}
      media={
        <div className="relative">
          <CardMedia src={stay.thumbnail} alt={stay.name} fallback={<MediaFallback icon={BedDouble} className="aspect-[16/10] w-full rounded-t-2xl" />} />
          {locked && <span className="photo-chip absolute top-2.5 left-2.5"><Check className="size-3.5 text-positive" aria-hidden /> Your stay</span>}
          {comparing && <CompareMark selected={selected} />}
        </div>
      }
      glyph={BedDouble}
      title={stay.name}
      meta={[
        kind,
        typeof stay.stars === "number" && stay.stars > 0 ? `${stay.stars}-star` : null,
        typeof stay.rating === "number" && stay.rating > 0 ? <span key="g" className="tabular-nums">{`${stay.rating}/10 guests${stay.reviewCount ? ` (${compactCount(stay.reviewCount)})` : ""}`}</span> : null,
      ]}
      fact={
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-lg leading-tight font-semibold tabular-nums">{money(stay.nightlyAmount, stay.currency)}</span>
          <span className={type.meta}>/ night</span>
          {stay.totalAmount ? <span className={cn(type.meta, "w-full tabular-nums")}>{money(stay.totalAmount, stay.currency)} total</span> : null}
        </p>
      }
      badges={stay.boardName || stay.refundable ? (
        <>
          {stay.boardName && <Badge>{stay.boardName}</Badge>}
          {stay.refundable && <Badge tone="positive" icon={Check}>Free cancellation</Badge>}
        </>
      ) : undefined}
      extra={comparing ? <p className={type.meta}>{selected ? "Selected" : "Click card to select"}</p> : undefined}
      actions={<DetailsButton label={`Rooms & details: ${stay.name}`} onClick={onOpen}>Rooms &amp; details</DetailsButton>}
    />
  );
}
