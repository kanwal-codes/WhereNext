"use client";

import { useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { StaySurface } from "@/features/stays/ui/StaySurface";
import { MyStays } from "@/features/stays/ui/MyStays";
import { useTripStays } from "@/features/stays/application/useTripStays";

export default function StayPage() {
  const { tripId, data } = useTripData();
  const [view, setView] = useState<"browse" | "mine">("browse");
  const stays = useTripStays(tripId);
  return (
    <RouteScaffold
      eyebrow="Stay"
      title="Where you’ll come back to each night"
      description="Hotels near your destination. Lock a room and the rest of the plan measures from it."
      tabs={
        <SegmentedSwitch
          label="Stay view"
          value={view}
          onChange={setView}
          options={[
            { key: "browse", label: "Browse" },
            { key: "mine", label: stays.loading ? "My stays" : `My stays (${stays.items.length})` },
          ]}
        />
      }
    >
      {/* Browse stays mounted while My stays is open: the search, its filters and its results are still there when you come back. */}
      <div hidden={view !== "browse"}>
        <StaySurface tripId={tripId} destination={data?.trip.destination ?? ""} />
      </div>
      {view === "mine" && <MyStays tripId={tripId} items={stays.items} loading={stays.loading} onRemove={stays.remove} onBrowse={() => setView("browse")} />}
    </RouteScaffold>
  );
}
