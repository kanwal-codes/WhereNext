"use client";

import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { PHONE_V2 } from "@/lib/phone-v2";
import { compareAnchors, compareRows, compareStats } from "@/features/places/domain/compare-places";
import { useComparePlaces } from "@/features/places/application/useComparePlaces";
import { CompareTable } from "@/features/places/ui/CompareTable";
import { ComparePhone } from "@/features/places/ui/ComparePhone";

/** The side-by-side place table. Used by the `/compare` route and the chat compare panel. */
export function CompareView({ tripId, ids, onIdsChange }: { tripId: string; ids: string[]; onIdsChange?: (ids: string[]) => void }) {
  const { data, present, loading, savedIds, choose } = useComparePlaces(tripId, ids);

  if (ids.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <h3 className="font-display text-lg">Nothing to compare yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Pick two to four places from{" "}
          <Link href={`/trips/${tripId}/discover`} className="font-medium text-primary">Discover</Link>, or ask Roam to
          &ldquo;compare these&rdquo;.
        </p>
      </div>
    );
  }

  if (loading && present.length === 0) return <Skeleton className="h-72" />;

  const { anchors, distanceLabel } = compareAnchors((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>, (data?.itinerary ?? []) as Array<{ title?: unknown; metadata?: unknown }>);
  const props = { tripId, ids, onIdsChange, present, rows: compareRows(distanceLabel), stats: compareStats(present.map(([, d]) => d), anchors), savedIds, onChoose: (id: string, d: Parameters<typeof choose>[1]) => void choose(id, d) };

  return (
    <>
      {PHONE_V2 && <ComparePhone {...props} />}
      <CompareTable {...props} />
    </>
  );
}
