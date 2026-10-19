"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BedDouble, CalendarX, Check, ChevronRight, CloudOff, Compass, Navigation } from "lucide-react";
import { stopGlyph } from "@/features/conversation/ui/blocks/glyphs";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";
import { EmptyState } from "@/components/EmptyState";
import { readTrip } from "@/lib/client/offline-store";
import { PHONE_V2 } from "@/lib/phone-v2";
import { shortTripTitle } from "@/components/shell/trip-title";
import { tripDayIndex } from "@/lib/trip-dates";
import { readStayDecision } from "@/packages/contracts/stay";
import { TripWeather } from "@/components/TripWeather";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { clockLabel, isTransit, reservationsByDay } from "@/lib/trip-reservations";
import { effectiveStops, stopForDate } from "@/lib/trip-stops";
import type { Reservation } from "@/packages/contracts/reservation";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type ItineraryRow = { id: string; title: string; day_index: number; position?: number; metadata?: { time?: unknown; latitude?: unknown; longitude?: unknown } | null };
const timeOf = (r: ItineraryRow) => (typeof r.metadata?.time === "string" ? r.metadata.time : "");
const minutesOf = (t: string) => { const [h, m] = t.split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

export function TodayView({ tripId }: { tripId: string }) {
  const live = useTripDataMaybe()?.data ?? null;
  const [offline, setOffline] = useState<{ data: TripWorkspaceData; savedAt: number } | null>(null);

  useEffect(() => {
    if (live) return;
    void readTrip(tripId).then(setOffline);
  }, [live, tripId]);

  // Phone redesign: the approved Today (a map of the day, one "Next up" card, then what is left).
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  const [savedOffline, setSavedOffline] = useState(false);
  useEffect(() => {
    if (!phone) return;
    void readTrip(tripId).then((r) => setSavedOffline(Boolean(r)));
  }, [phone, tripId]);
  const [mapFailed, setMapFailed] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(new Date().getHours() * 60 + new Date().getMinutes()); }, []);

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

  // What is booked for today: flights and trains with their times, check-ins, tickets (their files open from here).
  const reservations = useMemo(() => (data?.reservations ?? []) as unknown as Reservation[], [data?.reservations]);
  const bookedToday = useMemo(() => (dayIndex == null ? [] : (reservationsByDay(reservations, data?.trip.start_date).get(dayIndex) ?? [])), [reservations, dayIndex, data?.trip.start_date]);
  // The stay you are in tonight: the one chosen in the app, else a booked stay whose nights include today.
  const todayDate = dayIndex != null && data?.trip.start_date ? new Date(Date.parse(`${data.trip.start_date}T00:00:00Z`) + (dayIndex - 1) * 86_400_000).toISOString().slice(0, 10) : null;
  const bookedStay = useMemo(
    () => (todayDate ? reservations.find((r) => r.kind === "stay" && r.status !== "cancelled" && r.startsOn && r.startsOn <= todayDate && (r.endsOn ?? r.startsOn) > todayDate) ?? null : null),
    [reservations, todayDate],
  );
  const city = useMemo(() => (data?.trip ? (stopForDate(effectiveStops(data.trip).stops, todayDate)?.city ?? null) : null), [data?.trip, todayDate]);

  if (!data) {
    return <p className="mx-auto max-w-lg px-5 py-16 text-center text-sm text-muted-foreground">Nothing saved for offline yet. Open this trip while online first.</p>;
  }

  if (phone) {
    // Before the trip starts: the first day that has stops, so the screen shows what it will be like.
    const firstPlanned = ((data.itinerary ?? []) as ItineraryRow[]).reduce((m, r) => Math.min(m, r.day_index), Infinity);
    const viewDay = dayIndex ?? (Number.isFinite(firstPlanned) ? firstPlanned : 1);
    const rows = ((data.itinerary ?? []) as ItineraryRow[])
      .filter((r) => r.day_index === viewDay)
      .sort((a, b) => (timeOf(a) || "99:99").localeCompare(timeOf(b) || "99:99") || (a.position ?? 0) - (b.position ?? 0));
    const running = dayIndex != null;
    const viewDate = data.trip.start_date ? new Date(Date.parse(`${data.trip.start_date}T00:00:00Z`) + (viewDay - 1) * 86_400_000).toISOString().slice(0, 10) : null;
    const viewCity = stopForDate(effectiveStops(data.trip).stops, viewDate)?.city ?? city;
    const upcoming = running && now != null ? rows.filter((r) => { const t = minutesOf(timeOf(r)); return t == null || t >= now - 30; }) : rows;
    const next = upcoming[0];
    const later = upcoming.slice(1);
    const nextMinutes = next ? minutesOf(timeOf(next)) : null;
    const until = running && now != null && nextMinutes != null ? nextMinutes - now : null;
    const untilLabel = until == null ? null : until <= 0 ? "Now" : until < 60 ? `In ${until} min` : `In ${Math.floor(until / 60)}h${until % 60 ? ` ${until % 60}m` : ""}`;
    const startLine = (() => {
      const start = data.trip.start_date;
      if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
      return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
    })();
    const markers = rows
      .map((r) => [Number(r.metadata?.longitude), Number(r.metadata?.latitude)] as const)
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0))
      .map(([lng, lat]) => `${lng},${lat}`);
    const isBookedStop = (title: string) => bookedToday.some((b) => b.reservation.title.trim().toLowerCase() === title.trim().toLowerCase());
    const nextLat = Number(next?.metadata?.latitude);
    const nextLng = Number(next?.metadata?.longitude);
    const navHref = Number.isFinite(nextLat) && Number.isFinite(nextLng) && (nextLat !== 0 || nextLng !== 0) ? `https://www.google.com/maps/dir/?api=1&destination=${nextLat},${nextLng}` : null;
    const Glyph = next ? stopGlyph(undefined, next.title) : null;
    return (
      <div className="px-5 pt-2 pb-16">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{running ? (dateLine ?? "Today") : startLine ? `Trip starts ${startLine}` : "Your trip"}</p>
          {(savedOffline || isOffline) && <p className="inline-flex items-center gap-1 text-xs font-semibold text-positive"><Check className="size-3.5" aria-hidden />Saved offline</p>}
        </div>
        {isOffline && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><CloudOff className="size-3.5" /> Showing your last saved copy</p>}
        <h1 className="mt-1 font-display text-[2.5rem] leading-[1.05] font-medium tracking-[-0.04em]">{running ? "Today" : `Day ${viewDay}`}</h1>
        {viewCity && <TripWeather tripId={tripId} location={viewCity} className="mt-2" />}

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
              {untilLabel && <span className="rounded-full bg-coral-fill px-3 py-1 text-xs font-semibold text-white">{untilLabel}</span>}
            </div>
            <h2 className="mt-2 font-display text-[1.625rem] leading-[1.12] font-medium tracking-[-0.03em] text-balance">{next.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-ink-soft">
              <span suppressHydrationWarning>{[viewCity, timeOf(next) ? clockLabel(timeOf(next)) : null].filter(Boolean).join(" · ")}</span>
              {isBookedStop(next.title) && <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive"><Check className="size-3.5" aria-hidden />Tickets booked</span>}
            </p>
            {navHref ? (
              <a href={navHref} target="_blank" rel="noreferrer noopener" className="btn-primary mt-4 h-12 w-full rounded-full"><Navigation className="size-4" aria-hidden /> Navigate</a>
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
        <Link href={`/trips/${tripId}/itinerary`} className="mt-2 flex min-h-14 items-center justify-between border-t border-border text-[0.9375rem] font-medium text-ink-soft">
          See the whole day <ChevronRight className="size-5" aria-hidden />
        </Link>

        {bookedToday.length > 0 && (
          <ul aria-label="Booked today" className="mt-6 space-y-2">
            {bookedToday.map(({ reservation, note }) => {
              const Icon = KIND_META[reservation.kind].icon;
              const time = note === "Arrives" || note === "Check-out" ? reservation.endTime : reservation.startTime;
              return (
                <li key={`${reservation.id}-${note ?? "on"}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-leaf/30 bg-leaf/5 px-4 py-3">
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
          <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-positive-soft text-positive shadow-hairline"><BedDouble className="size-5" aria-hidden /></span>
            <div className="min-w-0">
              <p className="eyebrow text-positive">Where you&rsquo;re sleeping</p>
              <p className="mt-0.5 truncate font-display text-lg leading-snug font-medium">{stay ? stay.hotelName : bookedStay?.title}</p>
            </div>
          </div>
        )}
      </div>
    );
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
          {dayIndex == null ? (PHONE_V2 ? shortTripTitle(data.trip.name) : data.trip.name) : dateLine ?? "Today"}
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
                <li key={`${reservation.id}-${note ?? "on"}`} className="flex items-center gap-3.5 rounded-2xl border border-leaf/30 bg-leaf/5 p-4">
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
