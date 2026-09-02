"use client";

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { Skeleton } from "@/components/Skeleton";
import { CompareView } from "@/components/CompareView";

function CompareInner({ tripId }: { tripId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ids = useMemo(
    () => (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4),
    [params],
  );
  const setIds = useCallback(
    (next: string[]) => {
      const p = new URLSearchParams(params.toString());
      if (next.length) p.set("ids", next.join(","));
      else p.delete("ids");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return <CompareView tripId={tripId} ids={ids} onIdsChange={setIds} />;
}

export default function ComparePage() {
  const { tripId } = useTripData();
  return (
    <RouteScaffold
      wide
      eyebrow="Compare"
      title="Side by side, so you can decide"
      description="Two to four places, aligned on rating, price, hours and where the data came from. You usually get here from Discover or by asking the assistant to compare."
    >
      <Suspense fallback={<Skeleton className="h-72" />}>
        <CompareInner tripId={tripId} />
      </Suspense>
    </RouteScaffold>
  );
}
