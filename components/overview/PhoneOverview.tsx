"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { BedDouble, CalendarRange, ChevronDown, ChevronRight, Share2, Ticket, Users } from "lucide-react";
import { RoutePanel } from "@/components/overview/RoutePanel";
import { ShareTrip } from "@/features/trip/ui/ShareTrip";
import { lodgingGaps } from "@/lib/trip-reservations";
import { useGroupUnread } from "@/lib/client/use-group-unread";
import { effectiveStops } from "@/lib/trip-stops";
import { cn } from "@/lib/utils";
import type { Reservation } from "@/packages/contracts/reservation";

type TripLike = { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown };

/** How many stops of the route show before "Show all". */
const ROUTE_PREVIEW = 4;

const nights = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

/** One row of "The trip": an icon tile, a name, one line that says what needs attention, a chevron. */
function TripRow({ href, icon: Icon, title, note, tone = "quiet", dot = false, onClick, expanded }: {
  href?: string; icon: ComponentType<{ className?: string }>; title: string; note?: ReactNode; tone?: "quiet" | "attention" | "new"; dot?: boolean; onClick?: () => void; expanded?: boolean;
}) {
  const body = (
    <>
      <span aria-hidden className={cn("relative grid size-11 shrink-0 place-items-center rounded-2xl ring-1", tone === "attention" ? "bg-muted text-caution ring-border/70" : "bg-surface text-ink-soft ring-border/70")}>
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
 * Phone redesign: under the hero and the next step, the Overview is two quiet bands. The route as its stops on one rail,
 * and "The trip" as plain rows that each say whether anything needs you (see the approved Overview).
 */
export function PhoneOverview({ tripId, trip, reservations, stays }: { tripId: string; trip: TripLike; reservations: Reservation[]; stays: Array<{ startsOn: string | null; endsOn: string | null }> }) {
  const { stops } = effectiveStops(trip);
  const [panel, setPanel] = useState<"route" | "share" | null>(null);
  const [allStops, setAllStops] = useState(false);
  const unread = useGroupUnread(tripId, true);
  const live = reservations.filter((r) => r.status !== "cancelled");
  const gaps = lodgingGaps(reservations, trip.start_date, trip.end_date);
  const gapNights = gaps.reduce((t, g) => t + g.nights, 0);
  const stayCount = live.filter((r) => r.kind === "stay").length;
  return (
    <div className="space-y-9 px-4 pt-8 lg:hidden">
      {stops.length > 1 && (
        <section aria-label="The route">
          <h2 className="font-display text-widget font-medium tracking-[-0.025em]">The route</h2>
          {/* The stops in order on one rail, like the days of the plan: a few at a time, the rest a tap away, so ten places read as well as two. */}
          <ol className="mt-3 rounded-2xl border border-border bg-card px-4 py-1">
            {(allStops ? stops : stops.slice(0, ROUTE_PREVIEW)).map((s, i, shown) => {
              const n = s.startDate && s.endDate ? nights(s.startDate, s.endDate) : null;
              return (
                <li key={s.city} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
                  {/* The rail runs through the row from badge to badge, so the stops read as one route rather than a list of dots. */}
                  <span className="relative flex justify-center pt-3.5">
                    {shown.length > 1 && <span aria-hidden className={cn("absolute left-1/2 w-px -translate-x-1/2 bg-coral/30", i === 0 ? "top-7 bottom-0" : i === shown.length - 1 ? "top-0 h-7" : "inset-y-0")} />}
                    <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-coral-fill text-xs font-semibold text-white shadow-soft">{i + 1}</span>
                  </span>
                  <span className={cn("flex min-w-0 items-center justify-between gap-3 py-3.5", i < shown.length - 1 && "border-b border-border/70")}>
                    <span className="min-w-0 truncate font-display text-lg leading-snug font-medium tracking-[-0.015em]">{s.city}</span>
                    {n && <span className="shrink-0 text-sm text-ink-soft tabular-nums">{n} {n === 1 ? "night" : "nights"}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {stops.length > ROUTE_PREVIEW && (
            <button type="button" onClick={() => setAllStops((v) => !v)} aria-expanded={allStops} className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm font-medium text-ink-soft transition-colors active:bg-muted/60">
              {allStops ? "Show fewer" : `Show all ${stops.length} stops`}
              <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300", allStops && "rotate-180")} />
            </button>
          )}
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
