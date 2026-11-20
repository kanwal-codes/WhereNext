"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plane, Search } from "lucide-react";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { RailButton } from "@/components/RailButton";
import { RouteScaffold } from "@/components/RouteScaffold";
import { useTripData } from "@/components/TripDataProvider";
import { useTripFlights } from "@/features/flights/application/useTripFlights";
import { FlightsSurface } from "@/features/flights/ui/FlightsSurface";
import { MyFlights } from "@/features/flights/ui/MyFlights";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export default function FlightsPage() {
  const { tripId } = useTripData();
  const [view, setView] = useState<"search" | "mine">("search");
  const flights = useTripFlights(tripId);
  // As on Stay: a round button at the right of the phone header goes to the trip's flights and back; the desktop has the same as a button in the rail.
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const headerSwitch = useMemo(
    () => phone ? (
      <button
        type="button"
        onClick={() => setView((v) => (v === "search" ? "mine" : "search"))}
        aria-pressed={view === "mine"}
        aria-label={view === "mine" ? "Back to searching flights" : `My flights${flights.loading ? "" : `, ${flights.items.length}`}`}
        className={cn(PHONE_ROUND, "relative")}
      >
        {view === "mine" ? <ArrowLeft className="size-[1.2rem]" /> : <Plane className="size-[1.2rem]" />}
        {view === "search" && !flights.loading && flights.items.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, view, flights.loading, flights.items.length],
  );
  // The header says where you are: the search pill on the search, "My flights" on the list (no second, larger title under it).
  useSetPhoneHeader({ trailing: headerSwitch, title: view === "mine" ? "My flights" : undefined });
  return (
    <RouteScaffold
      eyebrow="Flights"
      phoneQuietTitle
      phoneHideSwitcher
      title="Flight prices for your dates"
      description="Prices in your currency, with every stop and layover shown."
      railAction={
        view === "mine" ? (
          <RailButton icon={<Search />} onClick={() => setView("search")}>Search flights</RailButton>
        ) : (
          <RailButton icon={<Plane />} onClick={() => setView("mine")}>{flights.loading ? "My flights" : `My flights (${flights.items.length})`}</RailButton>
        )
      }
    >
      {/* The search stays mounted while My flights is open: its fares are still there when you come back. */}
      <div hidden={view !== "search"}><FlightsSurface tripId={tripId} active={view === "search"} /></div>
      {view === "mine" && <MyFlights tripId={tripId} items={flights.items} loading={flights.loading} onRemove={flights.remove} onSearch={() => setView("search")} />}
    </RouteScaffold>
  );
}
