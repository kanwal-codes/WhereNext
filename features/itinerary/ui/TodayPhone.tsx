"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BedDouble, CalendarX, Check, CloudOff, Navigation } from "lucide-react";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { EmptyState } from "@/components/EmptyState";
import { TripWeather } from "@/components/TripWeather";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { clockLabel } from "@/lib/trip-reservations";
import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import type { TodayData } from "@/features/itinerary/application/useTodayData";
import { directionsTo, firstPlannedDay, isoDayOf, mapMarkers, minutesOf, startLineFor, stopsAhead, stopsOfDay, timeOf, untilLabel, type ItineraryRow } from "@/features/itinerary/domain/today";

/** The phone's Today: a map of the day, one "Next up" card, then what is left, what is booked and where you sleep. */
export function TodayPhone({ tripId, today }: { tripId: string; today: TodayData }) {
  const { data, dayIndex, now, city, bookedToday, stay, bookedStay, dateLine, isOffline } = today;
  const [mapFailed, setMapFailed] = useState(false);
  // Before the trip starts: the first day that has stops, so the screen shows what it will be like.
  const all = (data.itinerary ?? []) as ItineraryRow[];
  const viewDay = dayIndex ?? firstPlannedDay(all) ?? 1;
  const rows = stopsOfDay(all, viewDay);
  const running = dayIndex != null;
  const viewDate = isoDayOf(data.trip.start_date, viewDay);
  const viewCity = stopForDate(effectiveStops(data.trip).stops, viewDate)?.city ?? city;
  const upcoming = running && now != null ? stopsAhead(rows, now) : rows;
  const next = upcoming[0];
  const later = upcoming.slice(1);
  const nextMinutes = next ? minutesOf(timeOf(next)) : null;
  const until = running && now != null && nextMinutes != null ? nextMinutes - now : null;
  const untilText = untilLabel(until);
  const startLine = startLineFor(data.trip.start_date);
  const markers = mapMarkers(rows);
  const isBookedStop = (title: string) => bookedToday.some((b) => b.reservation.title.trim().toLowerCase() === title.trim().toLowerCase());
  const navHref = directionsTo(next);
  return (
    <div className="px-5 pt-2 pb-16">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{running ? (dateLine ?? "Today") : startLine ? `Trip starts ${startLine}` : "Your trip"}</p>
        {viewCity && <TripWeather tripId={tripId} location={viewCity} />}
      </div>
      {isOffline && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CloudOff className="size-3.5" /> Showing your last saved copy</p>}
      <h1 className="mt-1 font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.04em]">{running ? "Today" : `Day ${viewDay}`}</h1>

      {markers.length > 0 && !mapFailed && (
        <Link href={`/trips/${tripId}/map?day=${viewDay}`} aria-label="Open the day on the map" className="relative mt-4 block aspect-[16/7] overflow-hidden rounded-3xl bg-muted ring-1 ring-black/[0.05]">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin map image */}
          <img src={`/api/trips/${tripId}/map/static?markers=${encodeURIComponent(markers.join("|"))}&w=720&h=315`} alt="" onError={() => setMapFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-white/94 text-[#2a2623]"><ArrowUpRight className="size-[1.125rem]" aria-hidden /></span>
        </Link>
      )}

      {next ? (
        <section aria-label="Next up" className="mt-4 rounded-3xl bg-surface p-4 ring-1 ring-border/70">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">{running ? "Next up" : "First up"}</p>
            {untilText && <span className="rounded-full bg-coral-fill px-3 py-1 text-xs font-semibold text-white">{untilText}</span>}
          </div>
          <h2 className="mt-2 font-display text-title leading-[1.12] font-medium tracking-[-0.03em] text-balance">{next.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-ink-soft">
            <span suppressHydrationWarning>{[viewCity, timeOf(next) ? clockLabel(timeOf(next)) : null].filter(Boolean).join(" · ")}</span>
            {isBookedStop(next.title) && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground"><Check className="size-3.5 text-positive" aria-hidden />Tickets booked</span>}
          </p>
          {navHref ? (
            <a href={navHref} target="_blank" rel="noreferrer noopener" className="btn-primary mt-4 h-12 w-full rounded-full"><Navigation className="size-4" aria-hidden /> Directions</a>
          ) : (
            <Link href={`/trips/${tripId}/map?day=${viewDay}`} className="btn-primary mt-4 h-12 w-full rounded-full"><Navigation className="size-4" aria-hidden /> See it on the map</Link>
          )}
        </section>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={CalendarX}
            action={<Link href={`/trips/${tripId}/chat`} className="btn-primary-sm">Ask Roam for ideas</Link>}
          >
            {running && rows.length > 0 ? "That is everything planned for today." : "Nothing is planned for this day yet. A free day is a good day to wander, or let Roam suggest something."}
          </EmptyState>
        </div>
      )}

      {later.length > 0 && (
        <section aria-label="Later today" className="mt-7">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{running ? "Later today" : "Then"}</h2>
          <ul className="mt-1">
            {later.map((it) => {
              const g = stopGlyph(undefined, it.title);
              return (
                <li key={it.id}>
                  <Link href={`/trips/${tripId}/itinerary`} className="flex min-h-16 items-center gap-3.5 py-2">
                    <span aria-hidden className="grid size-[3.25rem] shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral-ink"><g.icon className="size-[1.375rem]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base leading-snug font-medium tracking-[-0.01em] text-balance">{it.title}</span>
                      <span suppressHydrationWarning className="mt-0.5 block text-sm text-muted-foreground">{[timeOf(it) ? clockLabel(timeOf(it)) : null, g.label].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {bookedToday.length > 0 && (
        <ul aria-label="Booked today" className="mt-6 space-y-2">
          {bookedToday.map(({ reservation, note }) => {
            const Icon = KIND_META[reservation.kind].icon;
            const time = note === "Arrives" || note === "Check-out" ? reservation.endTime : reservation.startTime;
            return (
              <li key={`${reservation.id}-${note ?? "on"}`} className="flex min-h-14 items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
                <Icon className="size-5 shrink-0 text-leaf" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{reservation.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{[note, time ? clockLabel(time) : null, reservation.place].filter(Boolean).join(" · ")}</p>
                </div>
                {reservation.attachments[0] && (
                  <a href={`/api/trips/${tripId}/reservations/${reservation.id}/files?path=${encodeURIComponent(reservation.attachments[0].path)}`} target="_blank" rel="noopener noreferrer" className="btn-chip shrink-0">Ticket</a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(stay || bookedStay) && (
        <div className="mt-6 flex items-center gap-3.5">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-positive-soft text-positive"><BedDouble className="size-6" aria-hidden /></span>
          <div className="min-w-0">
            <p className="eyebrow text-positive">{running ? "Tonight you sleep at" : "Where you’ll sleep"}</p>
            <p className="mt-0.5 truncate font-display text-lg leading-snug font-medium">{stay ? stay.hotelName : bookedStay?.title}</p>
          </div>
        </div>
      )}
    </div>
  );
}
