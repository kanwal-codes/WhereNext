"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { MapSurface } from "@/features/maps/ui/MapSurface";
import { TransportSurface } from "@/features/transport/ui/TransportSurface";
import { TripWeather } from "@/components/TripWeather";

export default function MapPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold
      eyebrow="Getting around"
      title="How close things actually are"
      description="Saved places and itinerary stops on one map, walk / drive / cycle time between any two, and live transit for the longer hops."
    >
      {data?.trip?.destination && <TripWeather tripId={tripId} location={data.trip.destination} card className="mb-6" />}
      <MapSurface tripId={tripId} />
      <section className="mt-10">
        <h2 className="font-display text-xl">Live public transit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Real departures between any two stops, stations, or addresses.</p>
        <div className="mt-4">
          <TransportSurface tripId={tripId} origin={data?.trip.origin ?? ""} destination={data?.trip.destination ?? ""} />
        </div>
      </section>
    </RouteScaffold>
  );
}
