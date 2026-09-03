"use client";

import { use } from "react";
import { TodayView } from "@/features/itinerary/ui/TodayView";

export default function TodayPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  return <TodayView tripId={tripId} />;
}
