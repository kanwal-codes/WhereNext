"use client";

import Link from "next/link";
import { CalendarClock, MapPin } from "lucide-react";
import { eventDetailHref } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/** A single event tile — links to the full event detail page. Fixed height so a grid of these is uniform. */
export function EventCard({ tripId, event, className }: { tripId: string; event: NearbyEvent; className?: string }) {
  return (
    <Link
      href={eventDetailHref(tripId, event)}
      className={cn(
        "flex h-[19rem] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-soft transition-shadow hover:shadow-lift",
        className,
      )}
    >
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external event image
        <img src={event.imageUrl} alt={event.title} loading="lazy" width={280} height={128} className="h-32 w-full shrink-0 object-cover" />
      ) : (
        <div className="grid h-32 w-full shrink-0 place-items-center bg-muted/50">
          <CalendarClock className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3.5">
        <span className="w-fit shrink-0 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{event.source}</span>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{event.title}</p>
        {event.date && <p className="line-clamp-1 text-xs text-muted-foreground">{event.date}</p>}
        {event.venue && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-1">{event.venue}</span>
          </p>
        )}
        <p className="mt-auto pt-1 text-[11px] font-medium text-primary">View details &rarr;</p>
      </div>
    </Link>
  );
}
