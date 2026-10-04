"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Compass, MapPin, Users, Wallet } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { useDocumentTitle } from "@/lib/use-document-title";
import { Reveal } from "@/components/motion-primitives";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { TripWeather } from "@/components/TripWeather";
import { BriefPanels } from "@/components/overview/BriefPanels";
import { OverviewHero, type HeroFact } from "@/components/overview/OverviewHero";
import { PlanDays } from "@/components/overview/PlanDays";
import { PlacesMosaic } from "@/components/overview/PlacesMosaic";
import { SectionHeading } from "@/components/overview/SectionHeading";
import { StayFeature } from "@/components/overview/StayFeature";
import type { TripSummary } from "@/components/trips/types";
import { tripDurationDays } from "@/features/trip/domain/trip";
import { ShareTrip } from "@/features/trip/ui/ShareTrip";
import { TripReviewPanel } from "@/features/workspace/ui/TripReviewPanel";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { isDisplayableDecision } from "@/lib/decisions-ui";
import { daysUntilTrip, tripDayIndex, tripWhen } from "@/lib/trip-dates";
import { budgetLabel, openQuestions, placePhotoName, planDays, tastePicture } from "@/lib/trip-overview";
import { readStayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";

type SavedPlace = { status?: string; places?: { id: string; name: string; category?: string | null; address?: string | null; metadata?: unknown } };
type ItineraryRow = { id: string; title: string; day_index: number; position?: number | null };
type DecisionRow = { id: string; kind: string; value: Record<string, unknown>; source?: string };

const action = "daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent";

export default function TripOverviewPage() {
  const { tripId, data } = useTripData();
  const titleTag = useDocumentTitle((data?.trip as { name?: string } | undefined)?.name ?? "Overview");
  const router = useRouter();
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
  const conversation = (data?.conversation ?? []) as Array<{ role: string; content: string }>;
  const notes = conversation.filter((m) => m.role === "assistant").slice(-3).reverse().map((m) => m.content.slice(0, 220));

  const destination = trip?.destination ?? "your destination";
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

  const facts: HeroFact[] = [
    { icon: CalendarDays, label: "Dates", value: trip?.start_date || trip?.duration_days ? tripWhen(trip?.start_date, trip?.end_date, trip?.duration_days) : null },
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
          statusText={statusText}
          facts={facts}
          rename={{ editing: editingName, draft: nameDraft, saving: savingName, start: startEditingName, setDraft: setNameDraft, save: () => void saveName(), cancel: () => setEditingName(false) }}
        />
      ) : (
        <div className="min-h-[34rem] animate-pulse bg-gradient-to-br from-muted to-card sm:min-h-[40rem]" />
      )}

      <div className="mx-auto max-w-6xl space-y-16 px-5 pt-8 sm:px-8 sm:pt-10">
        <Reveal>
          {/* The main action, then the two shortcuts: on a phone the action is full width with the shortcuts side by side; from sm up all three sit in a row. Desktop shows them too, though the sidebar lists them, so both layouts offer the same next steps. */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Link href={`/trips/${tripId}/chat`} className="btn-primary col-span-2 h-11 rounded-full px-6 sm:col-span-1">
              <RoamMark state="settled" size={30} /> Continue planning
            </Link>
            <Link href={`/trips/${tripId}/itinerary`} className={action}>
              <CalendarDays className="h-4 w-4" /> Itinerary
            </Link>
            <Link href={`/trips/${tripId}/discover`} className={action}>
              <Compass className="h-4 w-4" /> Discover
            </Link>
          </div>
        </Reveal>

        <Reveal>
          <TripReviewPanel tripId={tripId} />
        </Reveal>

        <Reveal>
          <StayFeature tripId={tripId} stay={stay} />
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
          weather={trip?.destination ? <TripWeather tripId={tripId} location={trip.destination} card /> : null}
          share={<ShareTrip tripId={tripId} />}
        />
      </div>
    </div>
  );
}
