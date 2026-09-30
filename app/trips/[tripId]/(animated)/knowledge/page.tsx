"use client";

import { useTripData } from "@/components/TripDataProvider";
import { Reveal } from "@/components/motion-primitives";
import { ChapterHero } from "@/components/overview/ChapterHero";
import { ConstraintsPanel, SavedPlacesList, UndecidedPanel } from "@/components/overview/KnowledgePanels";
import { TripContextSurface } from "@/features/workspace/ui/TripContextSurface";
import { BudgetSurface } from "@/features/budget/ui/BudgetSurface";
import type { Trip } from "@/features/trip/domain/trip";
import { placePhotoName, tastePicture } from "@/lib/trip-overview";

type SavedPlace = { places?: { id: string; name: string; category?: string | null; metadata?: unknown } };

export default function KnowledgePage() {
  const { tripId, data } = useTripData();
  const trip = (data?.trip as Trip) ?? null;
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const saved = ((data?.savedPlaces ?? []) as SavedPlace[])
    .map((s) => s.places)
    .filter(Boolean)
    .map((p) => ({ id: p!.id, name: p!.name, category: p!.category, photoName: placePhotoName(p) }));

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const taste = tastePicture(prefs);
  const undecided = [
    trip?.duration_days ? null : "Trip length",
    prefs.budget === undefined ? "Daily budget" : null,
    str(prefs.pace) ? null : "Daily pace",
    str(prefs.groupType) ? null : "Who's travelling",
    saved.length === 0 ? "Any saved places" : null,
  ].filter(Boolean) as string[];
  const constraintCount = taste.avoids.length + taste.dietary.length;

  return (
    <div className="min-h-full pb-16">
      <ChapterHero
        eyebrow="Trip knowledge"
        title="What Roam remembers"
        description="All of it is editable. If something here is wrong, the plan built on top of it is wrong too."
        stats={[
          { label: "Saved", value: String(saved.length), desc: saved.length === 1 ? "place" : "places" },
          { label: "Constraints", value: String(constraintCount), desc: "to respect" },
          { label: "Undecided", value: String(undecided.length), desc: "still open" },
        ]}
      />

      <div className="mx-auto grid max-w-6xl gap-8 px-5 pt-10 sm:px-8 lg:grid-cols-2">
        <Reveal>
          <TripContextSurface tripId={tripId} trip={trip} initialMemory={data?.preferences} initialDecisions={data?.decisions} />
        </Reveal>

        <div className="min-w-0 space-y-6">
          <Reveal delay={0.04}>
            <BudgetSurface
              tripId={tripId}
              durationDays={trip?.duration_days}
              travelers={trip?.travelers}
              initialBudget={(data?.preferences as Record<string, unknown> | undefined)?.budget}
            />
          </Reveal>
          <Reveal delay={0.06}>
            <SavedPlacesList tripId={tripId} places={saved} />
          </Reveal>
          <Reveal delay={0.1}>
            <ConstraintsPanel taste={taste} />
          </Reveal>
          <Reveal delay={0.14}>
            <UndecidedPanel items={undecided} tripId={tripId} />
          </Reveal>
        </div>
      </div>
    </div>
  );
}
