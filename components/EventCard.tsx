"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { EventPoster } from "@/components/EventPoster";
import { SafeImage } from "@/components/SafeImage";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { eventDetailHref, formatEventWhen } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/** A single event tile — opens the shared trip panel (falls back to the detail route). */
export function EventCard({ tripId, event, className, onSelect, compact = false }: { tripId: string; event: NearbyEvent; className?: string; onSelect?: () => void; compact?: boolean }) {
  const href = eventDetailHref(tripId, event);
  const seller = ticketSellerLabel(event.source, event.url);
  const panelCtx = useTripPanelMaybe();
  const compareEntry: CompareEntry = { id: event.url, kind: "event", name: event.title, href, subtitle: seller ?? "Event", attrs: { when: event.date, address: event.venue, detail: "Event" } };
  const open = panelCtx
    ? (e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        if (panelCtx.compareMode) { panelCtx.compareToggle(compareEntry); return; }
        panelCtx.openPanel({ kind: "event", seed: { name: event.title, url: event.url, source: event.source, imageUrl: event.imageUrl, date: event.date, venue: event.venue } });
      }
    : undefined;
  return (
    <div className={cn("relative", compact ? "h-auto" : "h-[19rem]", className)}>
      <Link
        href={href}
        onClick={(event) => {
          onSelect?.();
          open?.(event);
        }}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_6%,transparent)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-soft"
      >
      <SafeImage
        src={event.imageUrl}
        alt={event.title}
        width={280}
        height={128}
        className={cn("w-full shrink-0 object-cover", compact ? "h-28" : "h-32")}
        fallback={<EventPoster title={event.title} className={cn("w-full shrink-0", compact ? "h-28" : "h-32")} />}
      />
      <div className={cn("flex min-h-0 flex-1 flex-col gap-1.5", compact ? "p-3" : "p-3.5")}>
        {seller && <span className="w-fit shrink-0 text-xs text-muted-foreground">{seller}</span>}
        <p className={cn("line-clamp-2 text-sm font-medium leading-tight", !compact && "min-h-[2.5rem]")}>{event.title}</p>
        {event.date && <p className="line-clamp-1 text-xs text-muted-foreground">{formatEventWhen(event.date)}</p>}
        {event.venue && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-px size-3.5 shrink-0" aria-hidden /> <span className="line-clamp-1">{event.venue}</span>
          </p>
        )}
        <p className="mt-auto pt-1 text-xs font-medium text-primary">View details &rarr;</p>
      </div>
      </Link>
    </div>
  );
}
