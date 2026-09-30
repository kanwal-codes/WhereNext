"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/Skeleton";

/** The Mapbox map, loaded only when a panel needs it (it is a large dependency). */
export const LazyTripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[46vh] min-h-[280px] rounded-2xl" />,
});
