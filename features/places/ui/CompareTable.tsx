"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, MapPin, Star, X } from "lucide-react";
import { useDistance } from "@/components/use-distance";
import { ExternalLink } from "@/components/ExternalLink";
import { categoryLabel, priceLabel, priceRank, type GooglePlaceDetails } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { hoursToday, type CompareRow, type CompareRowKey, type CompareStats } from "@/features/places/domain/compare-places";

export type CompareViewProps = {
  tripId: string;
  ids: string[];
  onIdsChange?: (ids: string[]) => void;
  present: ReadonlyArray<readonly [string, GooglePlaceDetails]>;
  rows: readonly CompareRow[];
  stats: CompareStats;
  savedIds: Set<string>;
  onChoose: (id: string, d: GooglePlaceDetails) => void;
};

/** The side-by-side table: a column per place, a row per fact, the best of each marked with a badge. */
export function CompareTable({ tripId, ids, onIdsChange, present, rows, stats, savedIds, onChoose }: CompareViewProps) {
  const distance = useDistance();
  const { bestRating, bestPrice, mostReviews, closestKm, distanceKm } = stats;

  const cell = (d: GooglePlaceDetails, key: CompareRowKey) => {
    switch (key) {
      case "category":
        return categoryLabel(d.primaryType);
      case "rating":
        return typeof d.rating === "number" ? (
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-current text-coral" />
            {d.rating.toFixed(1)}
            {d.rating === bestRating && <span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral-ink">Best rated</span>}
          </span>
        ) : (
          "—"
        );
      case "reviews":
        return typeof d.userRatingCount === "number" ? (
          <span className="inline-flex items-center gap-2">
            {d.userRatingCount.toLocaleString()}
            {d.userRatingCount === mostReviews && mostReviews > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Most reviewed</span>
            )}
          </span>
        ) : (
          "—"
        );
      case "price":
        return (
          <span className="inline-flex items-center gap-2">
            {priceLabel(d.priceLevel) ?? "—"}
            {priceLabel(d.priceLevel) && priceRank(d.priceLevel) === bestPrice && (
              <span className="status-chip status-ok">Lowest</span>
            )}
          </span>
        );
      case "distance": {
        const km = distanceKm(d);
        return km === null ? (
          "—"
        ) : (
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {distance(km)}
            {km === closestKm && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Closest</span>}
          </span>
        );
      }
      case "hours":
        return hoursToday(d);
      case "source":
        return d.googleMapsUri ? <ExternalLink href={d.googleMapsUri}>Google Maps</ExternalLink> : "Google Maps";
    }
  };

  return (
  <div className={cn("overflow-x-auto overscroll-x-contain scrollbar-slim", "max-lg:hidden")}>
    <div className="grid min-w-[560px] gap-x-4" style={{ gridTemplateColumns: `120px repeat(${present.length}, minmax(170px, 1fr))` }}>
      <div className="sticky left-0 z-10 bg-background" />
      <AnimatePresence initial={false}>
        {present.map(([id, d]) => (
          <motion.div
            key={id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative rounded-2xl border border-border bg-card p-3"
          >
            {onIdsChange && ids.length > 2 && (
              <button
                type="button"
                onClick={() => onIdsChange(ids.filter((x) => x !== id))}
                aria-label={`Remove ${d!.displayName?.text ?? "place"} from comparison`}
                className="absolute top-2 right-2 rounded-full bg-background/90 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <Link href={`/trips/${tripId}/place/${encodeURIComponent(id)}`} className="block pr-6 font-display text-base leading-tight hover:text-primary">
              {d!.displayName?.text ?? "Place"}
            </Link>
            {d!.formattedAddress && <p className="mt-0.5 truncate pr-6 text-xs text-muted-foreground">{d!.formattedAddress}</p>}
            <button
              onClick={() => onChoose(id, d!)}
              disabled={savedIds.has(id)}
              className={cn(
                "mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                savedIds.has(id) ? "border-transparent bg-secondary text-foreground" : "border-border hover:bg-accent",
              )}
            >
              {savedIds.has(id) ? (
                <>
                  <Check className="h-3.5 w-3.5" /> On the trip
                </>
              ) : (
                "Choose this"
              )}
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {rows.map((row, i) => (
        <div key={row.key} className="col-span-full grid grid-cols-subgrid">
          <div className={cn("sticky left-0 z-10 bg-background py-3 pr-2 text-xs text-muted-foreground", i === 0 && "mt-4")}>{row.label}</div>
          {present.map(([id, d]) => (
            <div key={id + row.key} className={cn("border-t border-border py-3 text-sm leading-relaxed", i === 0 && "mt-4")}>
              {cell(d!, row.key)}
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
  );
}
