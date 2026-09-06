"use client";

import { Suspense, use } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";

function StayDetail({ tripId, hotelId }: { tripId: string; hotelId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <StayDetailView
      tripId={tripId}
      hotelId={hotelId}
      checkin={params.get("checkin") ?? undefined}
      checkout={params.get("checkout") ?? undefined}
      adults={Number(params.get("adults")) || undefined}
      rooms={Number(params.get("rooms")) || undefined}
      variant="page"
      onDatesChange={(ci, co) => {
        const qs = new URLSearchParams();
        if (ci) qs.set("checkin", ci);
        if (co) qs.set("checkout", co);
        router.replace(`${pathname}${qs.toString() ? `?${qs}` : ""}`);
      }}
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
