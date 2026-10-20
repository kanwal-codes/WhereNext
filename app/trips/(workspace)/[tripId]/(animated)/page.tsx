"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, Users, Wallet } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Reveal } from "@/components/motion-primitives";
import { TripRouteWeather } from "@/components/TripWeather";
import { BriefPanels } from "@/components/overview/BriefPanels";
import { ActionBar } from "@/components/overview/ActionBar";
import { OverviewHero, type HeroFact } from "@/components/overview/OverviewHero";
import { PlanDays } from "@/components/overview/PlanDays";
import { PlacesMosaic } from "@/components/overview/PlacesMosaic";
import { NextStepCard } from "@/components/overview/NextStepCard";
import { PHONE_V2 } from "@/lib/phone-v2";
import { PhoneOverview } from "@/components/overview/PhoneOverview";
import { useHydrated, useMediaQuery } from "@/lib/use-media-query";
import type { Reservation } from "@/packages/contracts/reservation";
import { SectionHeading } from "@/components/overview/SectionHeading";
import { StayFeature } from "@/components/overview/StayFeature";
import type { TripSummary } from "@/packages/contracts/trip-summary";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { ShareTrip } from "@/features/trip/ui/ShareTrip";
import { TripReviewPanel } from "@/features/workspace/ui/TripReviewPanel";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { isDisplayableDecision } from "@/lib/decisions-ui";
import { daysUntilTrip, tripDayIndex, tripWhen } from "@/lib/trip-dates";
import { RoutePanel } from "@/components/overview/RoutePanel";
import { SettleUpNotice } from "@/components/overview/SettleUpNotice";
import { useTripStays } from "@/features/stays/application/useTripStays";
import { effectiveStops } from "@/lib/trip-stops";
import { budgetLabel, openQuestions, placePhotoName, planDays, tastePicture } from "@/lib/trip-overview";
import { readStayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

type SavedPlace = { status?: string; places?: { id: string; name: string; category?: string | null; address?: string | null; metadata?: unknown } };
type ItineraryRow = { id: string; title: string; day_index: number; position?: number | null };
type DecisionRow = { id: string; kind: string; value: Record<string, unknown>; source?: string };

export default function TripOverviewPage() {
  const { tripId, data } = useTripData();
  const titleTag = useDocumentTitle((data?.trip as { name?: string } | undefined)?.name ?? "Overview");
  const router = useRouter();
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  // The desktop sections wait for the media query to be known (a phone must not mount them, even for one render: their effects fetch).
  const hydrated = useHydrated();
  const desktopTree = !phone && (!PHONE_V2 || hydrated);
  const trip = data?.trip;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const savedRows = ((data?.savedPlaces ?? []) as SavedPlace[]).map((row) => row.places).filter(Boolean) as NonNullable<SavedPlace["places"]>[];
  const itinerary = (data?.itinerary ?? []) as ItineraryRow[];
  const decisions = (data?.decisions ?? []) as DecisionRow[];
  const stay = readStayDecision(decisions);
  // The stay card already shows the stay and review bookkeeping is internal, so the list is everything else.
  const displayableDecisions = decisions.filter((d) => isDisplayableDecision(d.kind));
  const notes = (data?.recentNotes ?? []).map((content) => content.replace(/[*_#`>]+/g, "").replace(/\s+/g, " ").trim().slice(0, 220));

  const destination = trip?.destination ?? "your destination";
  const route = effectiveStops(trip);
  const staysBooked = useTripStays(tripId);
  const durationDays = trip ? (tripDurationDays(trip.start_date, trip.end_date) ?? trip.duration_days) : null;

  // Where we are relative to the trip. Null (silent) without a start date to anchor it.
  const daysUntil = daysUntilTrip(trip?.start_date);
  const dayIndex = tripDayIndex(trip?.start_date);
  const statusText =
    daysUntil == null ? null
    : daysUntil > 1 ? `${daysUntil} days to go`
    : daysUntil === 1 ? "Tomorrow"
    : daysUntil === 0 ? "Starts today"
    : trip?.duration_days && dayIndex != null && dayIndex <= trip.duration_days ? `Day ${dayIndex} of ${trip.duration_days}`
    : trip?.duration_days ? "Trip complete"
    : null;

  // "Nov 26 – Dec 10 (15 days)" wraps in the middle of the range on a phone: the range is the value, the length sits under it.
  const when = trip?.start_date || trip?.duration_days ? tripWhen(trip?.start_date, trip?.end_date, trip?.duration_days) : null;
  const whenParts = when ? /^(.*?)\s*\((.*)\)$/.exec(when) : null;
  const dateFact = whenParts ? { value: whenParts[1].replace(" – ", "\u2009–\u2009"), desc: whenParts[2] } : { value: when };

  const facts: HeroFact[] = [
    { icon: CalendarDays, label: "Dates", ...dateFact },
    { icon: Users, label: "Travellers", value: trip?.travelers ? String(trip.travelers) : null, desc: trip?.travelers ? "going" : undefined },
    { icon: Wallet, label: "Budget", value: budgetLabel(prefs) },
    { icon: MapPin, label: "From", value: trip?.origin || null },
  ];

  const places = savedRows.map((p) => ({ id: p.id, name: p.name, category: p.category, photoName: placePhotoName(p) }));
  // The cover falls back to a saved place's photo when the destination has none.
  const cover: TripSummary | null = trip
    ? {
        id: tripId,
        name: trip.name,
        destination: trip.destination ?? null,
        origin: trip.origin ?? null,
        duration_days: trip.duration_days ?? null,
        start_date: trip.start_date ?? null,
        end_date: trip.end_date ?? null,
        travelers: trip.travelers ?? null,
        hero_photo_name: trip.hero_photo_name ?? null,
        saved_photo_name: places.find((p) => p.photoName)?.photoName ?? null,
      }
    : null;

  const startEditingName = () => {
    setNameDraft(trip?.name || destination);
    setEditingName(true);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === trip?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename trip");
      announceWorkspaceChange("trip");
      router.refresh();
      setEditingName(false);
    } catch {
      notifyToast("Couldn't rename the trip. Try again.");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="min-h-full pb-16">
      {titleTag}
      {cover ? (
        <OverviewHero
          trip={cover}
          destination={destination}
          kicker={route.stops.length > 1 ? `${route.stops.length} cities` : undefined}
          statusText={statusText}
          facts={facts}
          rename={{ editing: editingName, draft: nameDraft, saving: savingName, start: startEditingName, setDraft: setNameDraft, save: () => void saveName(), cancel: () => setEditingName(false) }}
        />
      ) : (
        <div aria-hidden="true" className="skeleton min-h-[34rem] sm:min-h-[40rem]" />
      )}

      {PHONE_V2 && (
        <div className="px-5 pt-4 sm:px-8 lg:hidden">
          {PHONE_V2 && (
            <NextStepCard
              tripId={tripId}
              plannedDays={new Set(itinerary.map((row) => row.day_index)).size}
              totalDays={durationDays ?? null}
              firstOpenDay={(() => { const planned = new Set(itinerary.map((row) => row.day_index)); for (let d = 1; d <= (durationDays ?? 0); d++) if (!planned.has(d)) return d; return null; })()}
            />
          )}
        </div>
      )}
      {PHONE_V2 && trip && (
        <PhoneOverview
          tripId={tripId}
          trip={trip}
          reservations={(data?.reservations ?? []) as unknown as Reservation[]}
          stays={staysBooked.items.filter((i) => i.status !== "cancelled" && i.status !== "failed").map((i) => ({ startsOn: i.date, endsOn: i.endDate }))}
        />
      )}
      <div className={cn(PHONE_V2 && "max-lg:hidden")}><ActionBar tripId={tripId} name={trip?.name || destination} /></div>

      <div className={cn("mx-auto max-w-6xl space-y-16 px-5 pt-4 sm:px-8 sm:pt-6", PHONE_V2 && "max-lg:space-y-12")}>
        <Reveal>
          <TripReviewPanel tripId={tripId} />
        </Reveal>

        <Reveal>
          <SettleUpNotice tripId={tripId} />
        </Reveal>

        {desktopTree && route.stops.length > 1 && trip && (
          <Reveal>
            <RoutePanel tripId={tripId} trip={trip} stays={staysBooked.items.filter((i) => i.status !== "cancelled" && i.status !== "failed").map((i) => ({ startsOn: i.date, endsOn: i.endDate }))} />
          </Reveal>
        )}

        {desktopTree && (
          <>
        <Reveal>
          <StayFeature tripId={tripId} stay={stay} booked={staysBooked.items} />
        </Reveal>

        <section>
          <SectionHeading title="The plan" href={`/trips/${tripId}/itinerary`} cta="Full itinerary" />
          <PlanDays tripId={tripId} days={planDays(itinerary, trip?.start_date, 3)} />
        </section>

        <section>
          <SectionHeading title="Saved places" count={places.length} href={`/trips/${tripId}/discover`} cta="Discover more" />
          <PlacesMosaic tripId={tripId} places={places} />
        </section>

        <BriefPanels
          tripId={tripId}
          taste={tastePicture(prefs)}
          questions={openQuestions({ durationDays, preferences: prefs, savedCount: places.length })}
          decisions={displayableDecisions}
          notes={notes}
          weather={trip?.destination ? <TripRouteWeather tripId={tripId} trip={trip} /> : null}
          share={<ShareTrip tripId={tripId} />}
        />
          </>
        )}
      </div>
    </div>
  );
}
