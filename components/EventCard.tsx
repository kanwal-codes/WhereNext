"use client";

import { useRouter } from "next/navigation";
import { EventPoster } from "@/components/EventPoster";
import { SafeImage } from "@/components/SafeImage";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { CompareMark, DetailsButton, EntityCard, MEDIA_ROW } from "@/features/conversation/ui/blocks/ui";
import { eventDetailHref, formatEventWhen } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/**
 * An event, as Discover and the nearby lists show it: the shared `EntityCard`, the same anatomy Roam
 * uses for a place or a stay (16:10 photo, title, one meta line, the action at the foot). Opens the
 * shared trip panel, and falls back to the detail route when there is no panel.
 */
export function EventCard({ tripId, event, className, onSelect, compact = false, phoneRow = false, tile = false }: { tripId: string; event: NearbyEvent; className?: string; onSelect?: () => void; /** The narrow lane version: photo, title, one meta line. */ compact?: boolean; /** A horizontal card on a phone (a long list): the whole card opens. */ phoneRow?: boolean; /** A bare photo tile (photo, when, title, venue) for a short row of suggestions inside a detail view. */ tile?: boolean }) {
  const router = useRouter();
  const href = eventDetailHref(tripId, event);
  const seller = ticketSellerLabel(event.source, event.url);
  const panelCtx = useTripPanelMaybe();
  const compareEntry: CompareEntry = { id: event.url, kind: "event", name: event.title, href, subtitle: seller ?? "Event", attrs: { when: event.date, address: event.venue, detail: "Event" } };
  const open = () => {
    onSelect?.();
    if (!panelCtx) return router.push(href);
    if (panelCtx.compareMode) return panelCtx.compareToggle(compareEntry);
    panelCtx.openPanel({ kind: "event", seed: { name: event.title, url: event.url, source: event.source, imageUrl: event.imageUrl, date: event.date, venue: event.venue } });
  };
  const comparing = Boolean(panelCtx?.compareMode);
  const selected = comparing && Boolean(panelCtx?.compareHas(event.url));
  if (tile) {
    return (
      <button type="button" onClick={open} aria-label={`Open ${event.title}`} className={cn("group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", className)}>
        <span className="relative block overflow-hidden rounded-2xl bg-muted">
          <SafeImage
            src={event.imageUrl}
            alt=""
            width={416}
            height={312}
            className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            fallback={<EventPoster title={event.title} className="aspect-[4/3] w-full" />}
          />
        </span>
        {event.date && <span className="mt-2.5 block text-xs font-medium text-coral-ink">{formatEventWhen(event.date)}</span>}
        <span className={cn("block line-clamp-2 text-sm leading-snug font-medium", event.date ? "mt-0.5" : "mt-2.5")}>{event.title}</span>
        {event.venue && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.venue}</span>}
      </button>
    );
  }
  return (
    <div className={cn("h-full", className)}>
      <EntityCard
        label={`Open ${event.title}`}
        onOpen={open}
        href={href}
        compact={compact}
        phoneRow={phoneRow}
        className={selected ? "ring-2 ring-coral" : undefined}
        media={
          <div className={cn("relative", phoneRow && "max-sm:h-full")}>
            <SafeImage
              src={event.imageUrl}
              alt={event.title}
              width={416}
              height={260}
              className={cn("aspect-[16/10] w-full rounded-t-2xl object-cover", phoneRow && MEDIA_ROW)}
              fallback={<EventPoster title={event.title} className={cn("aspect-[16/10] w-full rounded-t-2xl", phoneRow && MEDIA_ROW)} />}
            />
            {comparing && <CompareMark selected={selected} />}
          </div>
        }
        title={event.title}
        meta={[event.date ? formatEventWhen(event.date) : null, event.venue, seller]}
        extra={comparing ? <p className="text-xs text-muted-foreground">{selected ? "Selected" : "Click card to select"}</p> : undefined}
        actions={<DetailsButton label={`Details: ${event.title}`} onClick={open} />}
      />
    </div>
  );
}
