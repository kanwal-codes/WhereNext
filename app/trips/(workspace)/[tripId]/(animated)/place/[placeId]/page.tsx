"use client";

import { use } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";

export default function PlaceDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  const { tripId } = useTripData();
  const { placeId } = use(params);

  return <PlaceDetailView tripId={tripId} placeId={placeId} variant="page" />;
}
