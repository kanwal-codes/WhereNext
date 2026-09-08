"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";

function StayDetail({ tripId, hotelId }: { tripId: string; hotelId: string }) {
  const params = useSearchParams();
  return (
    <StayDetailView
      tripId={tripId}
      hotelId={hotelId}
      checkin={params.get("checkin") ?? undefined}
      checkout={params.get("checkout") ?? undefined}
      variant="page"
    />
  );
}

export default function StayDetailPage({ params }: { params: Promise<{ hotelId: string }> }) {
  const { tripId } = useTripData();
  const { hotelId } = use(params);
  return (
    <Suspense fallback={<p className="px-5 py-16 text-center text-sm text-muted-foreground">Loading hotel…</p>}>
      <StayDetail tripId={tripId} hotelId={decodeURIComponent(hotelId)} />
    </Suspense>
  );
}
