"use client";

import Link from "next/link";
import { BedDouble, CalendarX, CloudOff, Compass } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";
import { EmptyState } from "@/components/EmptyState";
import { TripWeather } from "@/components/TripWeather";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { shortTripTitle } from "@/components/shell/trip-title";
import { clockLabel, isTransit } from "@/lib/trip-reservations";
import type { TodayData } from "@/features/itinerary/application/useTodayData";

/** Today on a wide screen: the day's title, what is booked, where you sleep, and the numbered stops. */
export function TodayWide({ tripId, today }: { tripId: string; today: TodayData }) {
  const { data, offline, isOffline, dayIndex, items, dateLine, stay, bookedToday, bookedStay, city } = today;
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
          {dayIndex == null ? (shortTripTitle(data.trip.name)) : dateLine ?? "Today"}
        </h1>
      </Reveal>

      {city && (
        <Reveal delay={0.1} y={8}>
          <p className="mt-3 text-sm text-muted-foreground">Today in {city}</p>
        </Reveal>
      )}
      {city && <TripWeather tripId={tripId} location={city} className="mt-1.5" />}

      {bookedToday.length > 0 && (
        <Reveal delay={0.12} y={10}>
          <ul aria-label="Booked today" className="mt-6 space-y-2">
            {bookedToday.map(({ reservation, note }) => {
              const Icon = KIND_META[reservation.kind].icon;
              const time = note === "Arrives" || note === "Check-out" ? reservation.endTime : reservation.startTime;
              return (
                <li key={`${reservation.id}-${note ?? "on"}`} className="flex items-center gap-3.5 rounded-2xl bg-secondary p-4">
                  <Icon className="size-5 shrink-0 text-leaf" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{reservation.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[note, time ? clockLabel(time) : null, reservation.place && reservation.toPlace && (note === "Departs" || !note) && isTransit(reservation.kind) ? `${reservation.place} → ${reservation.toPlace}` : reservation.place].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {reservation.attachments[0] && (
                    <a href={`/api/trips/${tripId}/reservations/${reservation.id}/files?path=${encodeURIComponent(reservation.attachments[0].path)}`} target="_blank" rel="noopener noreferrer" className="btn-chip shrink-0">
                      Ticket
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}

      {!stay && bookedStay && (
        <Reveal delay={0.14} y={10}>
          <div className="mt-6 flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-positive-soft text-positive shadow-hairline">
              <BedDouble className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow text-positive">Where you&rsquo;re sleeping</p>
              <p className="mt-0.5 truncate font-display text-lg leading-snug font-medium">{bookedStay.title}</p>
              {bookedStay.place && <p className="truncate text-xs text-muted-foreground">{bookedStay.place}</p>}
            </div>
          </div>
        </Reveal>
      )}

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
