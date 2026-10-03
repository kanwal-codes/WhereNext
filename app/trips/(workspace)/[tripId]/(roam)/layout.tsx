"use client";

import { usePathname } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { RoamShell } from "@/features/roam/ui/RoamShell";

/**
 * Shared layout for /chat and /group — Next.js keeps this mounted across navigation between the
 * two (only `children`, the trivial per-tab title page, swaps), so RoamShell and both surfaces it
 * hosts stay alive: no refetch, no re-animation, no lost scroll/panel state when switching tabs.
 */
export default function RoamLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tripId } = useTripData();
  const activeTab = pathname?.endsWith("/group") ? "group" : "roam";

  return (
    <>
      {children}
      <RoamShell tripId={tripId} activeTab={activeTab} />
    </>
  );
}
