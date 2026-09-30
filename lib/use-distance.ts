"use client";

import { useCallback } from "react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { formatDistanceKm, usesMiles } from "@/lib/application/geo";

/** Formats a distance in km in the traveller's unit: miles for a home country that uses them. */
export function useDistance(): (km: number) => string {
  const miles = usesMiles(useTripDataMaybe()?.data?.preferences?.country);
  return useCallback((km: number) => formatDistanceKm(km, miles), [miles]);
}
