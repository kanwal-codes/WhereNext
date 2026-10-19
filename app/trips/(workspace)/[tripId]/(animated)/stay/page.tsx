"use client";

import { useMemo, useState } from "react";
import { BedDouble, Search } from "lucide-react";
import { PHONE_V2 } from "@/lib/phone-v2";
import { useMediaQuery } from "@/lib/use-media-query";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { cn } from "@/lib/utils";
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
  // Phone redesign: no Browse | My stays switch. A round button at the right of the header goes to the other view.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  const headerSwitch = useMemo(
    () => phone ? (
      <button
        type="button"
        onClick={() => setView((v) => (v === "browse" ? "mine" : "browse"))}
        aria-pressed={view === "mine"}
        aria-label={view === "mine" ? "Back to browsing stays" : `My stays${stays.loading ? "" : `, ${stays.items.length}`}`}
        className={cn(PHONE_ROUND, "relative", view === "mine" && "border-foreground bg-foreground text-background")}
      >
        {view === "mine" ? <Search className="size-[1.2rem]" /> : <BedDouble className="size-[1.2rem]" />}
        {view === "browse" && !stays.loading && stays.items.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, view, stays.loading, stays.items.length],
  );
  useSetPhoneHeader({ trailing: headerSwitch });
  return (
    <RouteScaffold
      eyebrow="Stay"
      phoneTitle={view === "mine" ? "My stays" : undefined}
      phoneQuietTitle={view !== "mine"}
      phoneHideSwitcher
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
