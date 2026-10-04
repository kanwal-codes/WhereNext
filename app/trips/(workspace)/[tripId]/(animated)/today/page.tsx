"use client";

import { use } from "react";
import { useDocumentTitle } from "@/lib/use-document-title";
import { TodayView } from "@/features/itinerary/ui/TodayView";

export default function TodayPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const titleTag = useDocumentTitle("Today");
  return (
    <>
      {titleTag}
      <TodayView tripId={tripId} />
    </>
  );
}
