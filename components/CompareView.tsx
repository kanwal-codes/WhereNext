"use client";

import Link from "next/link";
import { Columns2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { compareAnchors, compareRows, compareStats } from "@/features/places/domain/compare-places";
import { useComparePlaces } from "@/features/places/application/useComparePlaces";
import { CompareTable } from "@/features/places/ui/CompareTable";
import { ComparePhone } from "@/features/places/ui/ComparePhone";

/** The side-by-side place table. Used by the `/compare` route and the chat compare panel. */
export function CompareView({ tripId, ids, onIdsChange }: { tripId: string; ids: string[]; onIdsChange?: (ids: string[]) => void }) {
  const { data, present, loading, savedIds, choose } = useComparePlaces(tripId, ids);

  if (ids.length < 2) {
    return (
      <EmptyState
        icon={Columns2}
        title="Nothing to compare yet"
        action={<Link href={`/trips/${tripId}/discover`} className="btn-primary h-11 rounded-full px-6">Open Discover</Link>}
      >
        Pick two to four places, or ask Roam to &ldquo;compare these&rdquo;.
      </EmptyState>
    );
  }

  if (loading && present.length === 0) return <Skeleton className="h-72" />;

  const { anchors, distanceLabel } = compareAnchors((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>, (data?.itinerary ?? []) as Array<{ title?: unknown; metadata?: unknown }>);
  const props = { tripId, ids, onIdsChange, present, rows: compareRows(distanceLabel), stats: compareStats(present.map(([, d]) => d), anchors), savedIds, onChoose: (id: string, d: Parameters<typeof choose>[1]) => void choose(id, d) };

  return (
    <>
      <ComparePhone {...props} />
      <CompareTable {...props} />
    </>
  );
}
