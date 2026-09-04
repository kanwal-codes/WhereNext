"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { EventPoster } from "@/components/EventPoster";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { eventDetailHref } from "@/lib/places-ui";
import { cn } from "@/lib/utils";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/** A single event tile — opens the shared trip panel (falls back to the detail route). */
export function EventCard({ tripId, event, className }: { tripId: string; event: NearbyEvent; className?: string }) {
  const href = eventDetailHref(tripId, event);
  const panelCtx = useTripPanelMaybe();
  const compareEntry: CompareEntry = { id: event.url, kind: "event", name: event.title, href, subtitle: event.source, attrs: { when: event.date, address: event.venue, detail: "Event" } };
  const open = panelCtx
    ? (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        if (panelCtx.compareMode) { panelCtx.compareToggle(compareEntry); return; }
        panelCtx.openPanel({ kind: "event", seed: { name: event.title, url: event.url, source: event.source, imageUrl: event.imageUrl, date: event.date, venue: event.venue } });
      }
    : undefined;
  return (
    <div className={cn("relative h-[19rem]", className)}>
      <Link
        href={href}
        onClick={open}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_6%,transparent)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-soft"
      >
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external event image
        <img src={event.imageUrl} alt={event.title} loading="lazy" width={280} height={128} className="h-32 w-full shrink-0 object-cover" />
      ) : (
        <EventPoster title={event.title} className="h-32 w-full shrink-0" />
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
    </div>
  );
}
