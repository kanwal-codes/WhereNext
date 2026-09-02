"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { EventDetailView } from "@/features/events/ui/EventDetailView";
import { SkeletonLines } from "@/components/Skeleton";

function EventDetail() {
  const { tripId } = useTripData();
  const q = useSearchParams();
  const name = q.get("name") ?? "";
  const url = q.get("url") ?? "";
  const source = q.get("source") ?? "web";

  if (!name) {
    return <p className="mx-auto max-w-3xl px-5 py-14 text-sm text-muted-foreground sm:px-8">No event selected.</p>;
  }

  return (
    <EventDetailView
      tripId={tripId}
      seed={{
        name,
        url,
        source,
        imageUrl: q.get("img") ?? undefined,
        date: q.get("date") ?? undefined,
        venue: q.get("venue") ?? undefined,
      }}
      variant="page"
    />
  );
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={<SkeletonLines lines={6} className="mx-auto max-w-3xl px-5 py-14 sm:px-8" />}>
      <EventDetail />
    </Suspense>
  );
}
