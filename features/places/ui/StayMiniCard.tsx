"use client";

import { useRouter } from "next/navigation";
import { BedDouble } from "lucide-react";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { DiscoverTile } from "@/features/places/ui/DiscoverTile";
import { CompareMark } from "@/features/conversation/ui/blocks/ui";
import { formatMoney } from "@/lib/currency";
import type { StayItem } from "../domain/discover";

/** A stay, as Discover shows it: the same `EntityCard` Roam uses (4-star, guest score, "£230 / night"). */
export function StayMiniCard({ tripId, stay, phoneRow = false, phoneTile }: { tripId: string; stay: StayItem; phoneRow?: boolean; phoneTile?: "feature" | "grid" }) {
  const router = useRouter();
  const panelCtx = useTripPanelMaybe();
  const href = `/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}`;
  const entry: CompareEntry = { id: stay.hotelId, kind: "stay", name: stay.name, href, image: stay.thumbnail ?? undefined, attrs: { price: `${Math.round(stay.nightlyAmount)} ${stay.currency}/night`, priceValue: stay.nightlyAmount, rating: stay.rating != null ? `${stay.rating}/10` : undefined, ratingValue: stay.rating ?? undefined, detail: "Stay" } };
  const open = () => {
    if (!panelCtx) return router.push(href);
    if (panelCtx.compareMode) return panelCtx.compareToggle(entry);
    panelCtx.openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name });
  };
  const comparing = Boolean(panelCtx?.compareMode);
  const selected = comparing && Boolean(panelCtx?.compareHas(stay.hotelId));
  if (phoneTile) {
    return (
      <DiscoverTile
        label={`Open ${stay.name}`}
        onOpen={open}
        href={href}
        src={stay.thumbnail}
        icon={BedDouble}
        title={stay.name}
        meta={stay.nightlyAmount > 0 ? `${formatMoney(stay.nightlyAmount, stay.currency)} / night` : "Stay"}
        rating={stay.rating}
        feature={phoneTile === "feature"}
        selected={selected}
        overlay={comparing ? <CompareMark selected={selected} /> : undefined}
      />
    );
  }
  return <StayResultCard stay={stay} href={href} onOpen={open} comparing={comparing} selected={selected} phoneRow={phoneRow} />;
}
