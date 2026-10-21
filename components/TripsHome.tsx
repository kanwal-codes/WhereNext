"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";
import { DeleteTripSheet } from "@/components/trips/DeleteTripSheet";
import { EmptyTrips } from "@/components/trips/EmptyTrips";
import { FeaturedTrip } from "@/components/trips/FeaturedTrip";
import { TripCard } from "@/components/trips/TripCard";
import { PhoneTripRow } from "@/components/trips/PhoneTripRow";
import { TripsHero } from "@/components/trips/TripsHero";
import { useStartTrip } from "@/components/trips/useStartTrip";
import { useTripList } from "@/components/trips/useTripList";
import { PHONE_V2 } from "@/lib/phone-v2";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { tripStatus } from "@/lib/trip-status";
import { cn } from "@/lib/utils";

export type { TripSummary };

export function TripsHome({ trips, displayName, userId }: { trips: TripSummary[]; displayName: string; userId?: string }) {
  const { list, now, view, setFilter, deleting, pendingDelete, setPendingDelete, removeTrip } = useTripList(trips, userId);
  const { counts, activeFilter, visible, featured, rest, tabs, showTabs } = view;
  const start = useStartTrip();

  return (
    <div className="min-h-screen">
      <TripsHero displayName={displayName} start={start} />

      <div className="mx-auto max-w-6xl px-5 pt-12 pb-20 sm:px-8">
        <Reveal delay={0.55}>
          <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-4", PHONE_V2 && "max-lg:flex-nowrap max-lg:gap-x-3")}>
            <div className="flex min-w-0 items-center gap-3">
              <h2 className={cn("font-display text-3xl tracking-tight", PHONE_V2 && "max-lg:text-2xl")}>{list.length > 0 ? "Your trips" : "No trips yet"}</h2>
              {list.length > 0 && <span className="daisy-badge daisy-badge-ghost tabular-nums">{list.length}</span>}
            </div>
            <Link href="/trips/new" className="btn-primary w-fit shrink-0">
              <Plus className="h-4 w-4" /> {PHONE_V2 ? <span><span className="max-lg:hidden">Create </span><span className="lg:hidden">New </span>trip</span> : "Create new trip"}
            </Link>
          </div>
          {showTabs && (
            <div role="tablist" aria-label="Filter trips" className="daisy-tabs daisy-tabs-box daisy-tabs-sm mt-5 w-fit max-w-full overflow-x-auto bg-muted">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn("daisy-tab gap-2 transition-[color,box-shadow]", activeFilter === tab.key ? "daisy-tab-active shadow-soft" : "text-muted-foreground hover:text-foreground")}
                >
                  {tab.label}
                  <span className="text-xs text-muted-foreground tabular-nums">{counts[tab.key]}</span>
                </button>
              ))}
            </div>
          )}
        </Reveal>

        {list.length === 0 ? (
          <EmptyTrips />
        ) : (
          <div key={activeFilter}>
            {PHONE_V2 && (
              <ul className="mt-6 space-y-3 lg:hidden">
                {visible.map((trip) => (
                  <li key={trip.id}>
                    <PhoneTripRow trip={trip} status={tripStatus(trip, now)} deleting={deleting === trip.id} onDelete={() => setPendingDelete(trip)} />
                  </li>
                ))}
              </ul>
            )}
            <div className={cn(PHONE_V2 && "max-lg:hidden")}>
            {featured && (
              <Reveal delay={0.1}>
                <div className="mt-8">
                  <FeaturedTrip
                    trip={featured}
                    status={tripStatus(featured, now)}
                    deleting={deleting === featured.id}
                    onDelete={() => setPendingDelete(featured)}
                  />
                </div>
              </Reveal>
            )}
            {rest.length > 0 && (
              <Stagger
                className={cn("mt-6 grid gap-5 sm:grid-cols-2", rest.length === 1 || rest.length === 2 || rest.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3")}
                delay={0.2}
              >
                {rest.map((trip) => (
                  <StaggerItem key={trip.id}>
                    <TripCard trip={trip} status={tripStatus(trip, now)} deleting={deleting === trip.id} onDelete={() => setPendingDelete(trip)} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
            </div>
          </div>
        )}
      </div>

      <DeleteTripSheet trip={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={(trip) => void removeTrip(trip)} />
    </div>
  );
}
