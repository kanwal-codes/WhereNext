"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, CalendarX, CloudOff, Compass } from "lucide-react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";
import { EmptyState } from "@/components/EmptyState";
import { readTrip } from "@/lib/client/offline-store";
import { tripDayIndex } from "@/lib/trip-dates";
import { readStayDecision } from "@/packages/contracts/stay";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type ItineraryRow = { id: string; title: string; day_index: number; position?: number };

export function TodayView({ tripId }: { tripId: string }) {
  const live = useTripDataMaybe()?.data ?? null;
  const [offline, setOffline] = useState<{ data: TripWorkspaceData; savedAt: number } | null>(null);

  useEffect(() => {
    if (live) return;
    void readTrip(tripId).then(setOffline);
  }, [live, tripId]);

  const data = live ?? offline?.data ?? null;
  const isOffline = !live && !!offline;

  const dayIndex = useMemo(() => tripDayIndex(data?.trip.start_date), [data?.trip.start_date]);
  const items = useMemo(() => {
    const rows = ((data?.itinerary ?? []) as ItineraryRow[]).slice();
    if (dayIndex == null) return rows.sort((a, b) => a.day_index - b.day_index || (a.position ?? 0) - (b.position ?? 0));
    return rows.filter((r) => r.day_index === dayIndex).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [data?.itinerary, dayIndex]);

  /** "Wednesday, September 30": the actual date of this trip day, read from the string so no timezone can shift it. */
  const dateLine = useMemo(() => {
    const start = data?.trip.start_date;
    if (!start || dayIndex == null || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + dayIndex - 1);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }, [data?.trip.start_date, dayIndex]);

  const stay = useMemo(() => readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>), [data?.decisions]);

  if (!data) {
    return <p className="mx-auto max-w-lg px-5 py-16 text-center text-sm text-muted-foreground">Nothing saved for offline yet. Open this trip while online first.</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-10">
      {isOffline && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <CloudOff className="h-3.5 w-3.5" /> Offline — showing your last saved copy
          {offline ? ` (${new Date(offline.savedAt).toLocaleString()})` : ""}
        </p>
      )}

      {/* The title sequence: where we are in the trip, what today is, then where we are sleeping. */}
      <Reveal y={8}>
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="size-1 rounded-full bg-coral" />
          {dayIndex == null ? "Your itinerary" : `Day ${dayIndex}${dateLine ? ` · ${data.trip.name}` : ""}`}
        </p>
      </Reveal>
      <Reveal delay={0.07} y={12}>
        <h1 className="mt-2.5 font-display text-4xl leading-[1.04] font-medium tracking-[-0.03em] text-balance sm:text-5xl">
          {dayIndex == null ? data.trip.name : dateLine ?? "Today"}
        </h1>
      </Reveal>

      {stay && (
        <Reveal delay={0.14} y={10}>
          <div className="mt-6 flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-positive-soft text-positive shadow-hairline">
              <BedDouble className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow text-positive">Where you&rsquo;re sleeping</p>
              <p className="mt-0.5 truncate font-display text-lg leading-snug font-medium">{stay.hotelName}</p>
              {stay.roomName && <p className="truncate text-xs text-muted-foreground">{stay.roomName}</p>}
            </div>
          </div>
        </Reveal>
      )}

      <div className="mt-8">
        {items.length === 0 ? (
          <Reveal delay={0.2} y={10}>
            <EmptyState
              icon={CalendarX}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/trips/${tripId}/chat`} className="btn-primary-sm">Ask Roam for ideas</Link>
                  <Link href={`/trips/${tripId}/discover`} className="btn-chip h-8 px-3.5 text-xs">
                    <Compass className="size-3.5" /> Discover places
                  </Link>
                </div>
              }
            >
              {dayIndex == null ? "No itinerary items yet." : "Nothing is planned for today yet. A free day is a good day to wander, or let Roam suggest something."}
            </EmptyState>
          </Reveal>
        ) : (
          <Stagger delay={0.2} gap={0.07} className="space-y-2.5">
            {items.map((it, i) => (
              <StaggerItem key={it.id}>
                <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coral-soft font-display text-sm font-medium text-coral-ink tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-body leading-snug font-medium">{it.title}</p>
                    {dayIndex == null && <p className="mt-0.5 text-2xs text-muted-foreground">Day {it.day_index}</p>}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
