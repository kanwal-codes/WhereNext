"use client";

import { useTripData } from "@/components/TripDataProvider";
import { PHONE_V2 } from "@/lib/phone-v2";
import { cn } from "@/lib/utils";
import { ChapterHero } from "@/components/overview/ChapterHero";
import { Reveal } from "@/components/motion-primitives";
import { ItinerarySurface } from "@/features/itinerary/ui/ItinerarySurface";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { readStayDecision } from "@/packages/contracts/stay";

export default function ItineraryPage() {
  const { tripId, data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const items = (data?.itinerary ?? []) as Array<{ day_index: number; metadata?: { locked?: boolean } | null }>;
  const trip = data?.trip;
  const length = trip ? (tripDurationDays(trip.start_date, trip.end_date) ?? trip.duration_days) : null;
  const planned = new Set(items.map((i) => i.day_index)).size;
  const locked = items.filter((i) => i.metadata?.locked === true).length;

  return (
    <div className="min-h-full pb-16">
      <div className={cn(PHONE_V2 && "max-lg:hidden")}>
      <ChapterHero
        eyebrow="Plan"
        title="The plan, day by day"
        description="Lock what’s fixed; move the rest between days."
        stats={[
          { label: "Days planned", value: String(planned), desc: length ? `of ${length}` : undefined },
          { label: "Stops", value: String(items.length), desc: "on the plan" },
          { label: "Locked", value: String(locked), desc: "fixed in place" },
        ]}
      />
      </div>
      <Reveal>
        <div className={cn("mx-auto w-full min-w-0 max-w-6xl px-5 pt-8 sm:px-8", PHONE_V2 && "max-lg:pt-2")}>
          <ItinerarySurface tripId={tripId} initialItems={data?.itinerary} startDate={trip?.start_date ?? null} lockedStay={lockedStay} destination={trip?.destination ?? null} trip={trip} plannedDays={length ?? 0} />
        </div>
      </Reveal>
    </div>
  );
}
