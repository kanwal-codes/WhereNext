"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { BedDouble, CalendarRange, ChevronDown, ChevronRight, Share2, Ticket, Users } from "lucide-react";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { RoutePanel } from "@/components/overview/RoutePanel";
import { ShareTrip } from "@/features/trip/ui/ShareTrip";
import { lodgingGaps } from "@/lib/trip-reservations";
import { useGroupUnread } from "@/lib/client/use-group-unread";
import { effectiveStops } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";
import type { Reservation } from "@/packages/contracts/reservation";

type TripLike = { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown };

const nights = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

/** One row of "The trip": an icon tile, a name, one line that says what needs attention, a chevron. */
function TripRow({ href, icon: Icon, title, note, tone = "quiet", dot = false, onClick, expanded }: {
  href?: string; icon: ComponentType<{ className?: string }>; title: string; note?: ReactNode; tone?: "quiet" | "attention" | "new"; dot?: boolean; onClick?: () => void; expanded?: boolean;
}) {
  const body = (
    <>
      <span aria-hidden className={cn("relative grid size-11 shrink-0 place-items-center rounded-2xl ring-1", tone === "attention" ? "bg-secondary text-caution ring-border/70" : "bg-surface text-ink-soft ring-border/70")}>
        <Icon className="size-5" />
        {dot && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-coral ring-[3px] ring-background" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg leading-snug font-medium tracking-[-0.015em]">{title}</span>
        {note && <span className={cn("block text-sm", tone === "attention" ? "font-semibold text-caution" : tone === "new" ? "font-semibold text-coral-ink" : "text-muted-foreground")}>{note}</span>}
      </span>
      {onClick ? <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} /> : <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
    </>
  );
  const cls = "flex min-h-[4.5rem] w-full items-center gap-3.5 border-t border-border py-3 text-left transition-colors active:bg-muted/60";
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={expanded} className={cls}>{body}</button>
  ) : (
    <Link href={href!} className={cls}>{body}</Link>
  );
}

/**
 * Phone redesign: under the hero and the next step, the Overview is two quiet bands. The route as a row of city cards,
 * and "The trip" as plain rows that each say whether anything needs you (see the approved Overview).
 */
export function PhoneOverview({ tripId, trip, reservations, stays }: { tripId: string; trip: TripLike; reservations: Reservation[]; stays: Array<{ startsOn: string | null; endsOn: string | null }> }) {
  const { stops } = effectiveStops(trip);
  const [panel, setPanel] = useState<"route" | "share" | null>(null);
  const unread = useGroupUnread(tripId, true);
  const live = reservations.filter((r) => r.status !== "cancelled");
  const gaps = lodgingGaps(reservations, trip.start_date, trip.end_date);
  const gapNights = gaps.reduce((t, g) => t + g.nights, 0);
  const stayCount = live.filter((r) => r.kind === "stay").length;
  return (
    <div className="space-y-9 px-5 pt-8 lg:hidden">
      {stops.length > 1 && (
        <section aria-label="The route">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-widget font-medium tracking-[-0.025em]">The route</h2>
            <span className="text-sm text-muted-foreground">{stops.length} cities</span>
          </div>
          <ol className="-mx-5 mt-3 flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 no-scrollbar scroll-px-5">
            {stops.map((s) => {
              const n = s.startDate && s.endDate ? nights(s.startDate, s.endDate) : null;
              return (
                <li key={s.city} className="w-36 shrink-0 snap-start">
                  <TripArt seed={hashString(s.city)} className="relative grid aspect-[4/3] place-items-end overflow-hidden rounded-2xl p-3 ring-1 ring-black/[0.04]">
                    <span aria-hidden className="absolute top-2 left-3 font-display text-4xl leading-none font-medium tracking-[-0.04em] text-foreground/20">{s.city.charAt(0)}</span>
                  </TripArt>
                  <p className="mt-2 font-display text-base leading-tight font-medium">{s.city}</p>
                  <p className="text-sm text-muted-foreground">{n ? `${n} ${n === 1 ? "night" : "nights"}` : "no dates yet"}</p>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section aria-label="The trip">
        <h2 className="font-display text-widget font-medium tracking-[-0.025em]">The trip</h2>
        <div className="mt-2 border-b border-border">
          <TripRow href={`/trips/${tripId}/stay`} icon={BedDouble} title="Stay" tone={gapNights > 0 ? "attention" : "quiet"} note={gapNights > 0 ? `${gapNights} ${gapNights === 1 ? "night" : "nights"} to fill` : stayCount > 0 ? `${stayCount} booked` : "Not chosen yet"} />
          <TripRow href={`/trips/${tripId}/bookings`} icon={Ticket} title="Bookings" note={live.length > 0 ? `${live.length} saved` : "Nothing yet"} />
          <TripRow href={`/trips/${tripId}/group`} icon={Users} title="Group chat" tone={unread > 0 ? "new" : "quiet"} dot={unread > 0} note={unread > 0 ? `${unread} new` : "All caught up"} />
          <TripRow icon={CalendarRange} title="Route and dates" note={stops.length > 1 ? "Cities and days in each" : "Where and when"} onClick={() => setPanel((p) => (p === "route" ? null : "route"))} expanded={panel === "route"} />
          {panel === "route" && <div className="pb-4"><RoutePanel tripId={tripId} trip={trip} stays={stays} /></div>}
          <TripRow icon={Share2} title="Share this trip" note="A link anyone can view" onClick={() => setPanel((p) => (p === "share" ? null : "share"))} expanded={panel === "share"} />
          {panel === "share" && <div className="pb-4"><ShareTrip tripId={tripId} /></div>}
        </div>
      </section>
    </div>
  );
}
