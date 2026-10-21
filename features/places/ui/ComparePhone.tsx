"use client";

import Link from "next/link";
import { Check, MapPin, Star, X } from "lucide-react";
import { useDistance } from "@/components/use-distance";
import { ExternalLink } from "@/components/ExternalLink";
import { categoryLabel, photoProxyUrl, priceLabel, priceRank, type GooglePlaceDetails } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { hoursTodayShort, type CompareRowKey } from "@/features/places/domain/compare-places";
import type { CompareViewProps } from "@/features/places/ui/CompareTable";

/** The phone's comparison: the picks side by side as photos, then one row per fact, the best one marked with a small dot. */
export function ComparePhone({ tripId, ids, onIdsChange, present, rows, stats, savedIds, onChoose }: CompareViewProps) {
  const distance = useDistance();
  const { bestRating, bestPrice, mostReviews, closestKm, distanceKm } = stats;
  const columns = { gridTemplateColumns: `repeat(${present.length}, minmax(0, 1fr))` };
  const win = (on: boolean) => on && present.length > 1;
  const dot = (on: boolean) => win(on) ? (
    <><span aria-hidden className="ml-1.5 inline-block size-1.5 rounded-full bg-leaf align-middle" /><span className="sr-only"> (best)</span></>
  ) : null;
  const phoneCell = (d: GooglePlaceDetails, key: CompareRowKey) => {
    const tone = (on: boolean) => cn("tabular-nums", win(on) && "text-leaf");
    switch (key) {
      case "category":
        return categoryLabel(d.primaryType);
      case "rating":
        return typeof d.rating === "number" ? (
          <span className={cn("inline-flex items-center gap-1.5", tone(d.rating === bestRating))}><Star className="size-4 fill-coral text-coral" aria-hidden />{d.rating.toFixed(1)}{dot(d.rating === bestRating)}</span>
        ) : "—";
      case "reviews":
        return typeof d.userRatingCount === "number" ? <span className={tone(d.userRatingCount === mostReviews && mostReviews > 0)}>{d.userRatingCount.toLocaleString()}{dot(d.userRatingCount === mostReviews && mostReviews > 0)}</span> : "—";
      case "price":
        return priceLabel(d.priceLevel) ? <span className={tone(priceRank(d.priceLevel) === bestPrice)}>{priceLabel(d.priceLevel)}{dot(priceRank(d.priceLevel) === bestPrice)}</span> : "—";
      case "distance": {
        const km = distanceKm(d);
        return km === null ? "—" : <span className={tone(km === closestKm)}>{distance(km)}{dot(km === closestKm)}</span>;
      }
      case "hours":
        return <span className="text-sm">{hoursTodayShort(d)}</span>;
      case "source":
        return d.googleMapsUri ? <ExternalLink href={d.googleMapsUri} className="text-sm">Google Maps</ExternalLink> : <span className="text-sm">Google Maps</span>;
    }
  };
  const names = present.map(([, d]) => d!.displayName?.text ?? "Place");

  return (
  <div className="lg:hidden">
    <h2 className="font-display text-title leading-[1.15] font-medium tracking-[-0.02em] text-balance">
      {names.length === 2 ? `${names[0]} or ${names[1]}?` : `Comparing ${names.length} places`}
    </h2>
    <div className="mt-5 grid gap-3" style={columns}>
      {present.map(([id, d]) => {
        const photo = photoProxyUrl(tripId, d!.photos?.[0]?.name, 480);
        return (
          <div key={id} className="flex min-w-0 flex-col">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
              <Link href={`/trips/${tripId}/place/${encodeURIComponent(id)}`} aria-label={`Open ${d!.displayName?.text ?? "place"}`} className="absolute inset-0 z-[1]" />
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
                <img src={photo} alt="" loading="lazy" decoding="async" className="photo-grade absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span aria-hidden className="absolute inset-0 grid place-items-center text-muted-foreground/60"><MapPin className="size-6" /></span>
              )}
              {onIdsChange && ids.length > 2 && (
                <button type="button" onClick={() => onIdsChange(ids.filter((x) => x !== id))} aria-label={`Remove ${d!.displayName?.text ?? "place"} from comparison`} className="photo-chip absolute top-2 right-2 z-[2] size-10 justify-center p-0">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <h3 className="mt-2.5 font-display text-base leading-tight font-medium text-balance">{d!.displayName?.text ?? "Place"}</h3>
            {d!.formattedAddress && <p className="mt-0.5 mb-3 truncate text-xs text-muted-foreground">{d!.formattedAddress}</p>}
            <button
              type="button"
              onClick={() => onChoose(id, d!)}
              disabled={savedIds.has(id)}
              className={cn("mt-auto flex h-11 w-full items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,transform] active:scale-[0.985]", savedIds.has(id) ? "border-transparent bg-secondary text-foreground" : "border-primary bg-primary text-primary-foreground")}
            >
              {savedIds.has(id) ? <><Check className="size-4" aria-hidden /> On the trip</> : "Choose this"}
            </button>
          </div>
        );
      })}
    </div>
    <dl className="mt-6">
      {rows.map((row) => (
        <div key={row.key} className="border-t border-border py-4">
          <dt className="eyebrow">{row.label}</dt>
          <dd className="mt-2 grid items-start gap-3 font-display text-lg leading-snug" style={columns}>
            {present.map(([id, d]) => <span key={id + row.key} className="min-w-0">{phoneCell(d!, row.key)}</span>)}
          </dd>
        </div>
      ))}
    </dl>
  </div>
  );
}
