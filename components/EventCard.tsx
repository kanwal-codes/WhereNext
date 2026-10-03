"use client";

import { useRouter } from "next/navigation";
import { EventPoster } from "@/components/EventPoster";
import { SafeImage } from "@/components/SafeImage";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { CompareMark, DetailsButton, EntityCard } from "@/features/conversation/ui/blocks/ui";
import { eventDetailHref, formatEventWhen } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/**
 * An event, as Discover and the nearby lists show it: the shared `EntityCard`, the same anatomy Roam
 * uses for a place or a stay (16:10 photo, title, one meta line, the action at the foot). Opens the
 * shared trip panel, and falls back to the detail route when there is no panel.
 */
export function EventCard({ tripId, event, className, onSelect, compact = false }: { tripId: string; event: NearbyEvent; className?: string; onSelect?: () => void; /** The narrow lane version: photo, title, one meta line. */ compact?: boolean }) {
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
  return (
    <div className={cn("h-full", className)}>
      <EntityCard
        label={`Open ${event.title}`}
        onOpen={open}
        href={href}
        compact={compact}
        className={selected ? "ring-2 ring-coral" : undefined}
        media={
          <div className="relative">
            <SafeImage
              src={event.imageUrl}
              alt={event.title}
              width={416}
              height={260}
              className="aspect-[16/10] w-full rounded-t-2xl object-cover"
              fallback={<EventPoster title={event.title} className="aspect-[16/10] w-full rounded-t-2xl" />}
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
