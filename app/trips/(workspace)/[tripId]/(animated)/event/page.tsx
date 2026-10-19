"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <EmptyState icon={Ticket} action={<Link href={`/trips/${tripId}/discover`} className="btn-secondary">Open Discover</Link>}>
          No event selected. Pick one from Discover, or ask Roam what is on.
        </EmptyState>
      </div>
    );
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
