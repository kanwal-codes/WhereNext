"use client";

import { useRouter } from "next/navigation";
import { EventPoster } from "@/components/EventPoster";
import { SafeImage } from "@/components/SafeImage";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { ArrowUpRight, CalendarDays, Ticket } from "lucide-react";
import { CompareMark } from "@/features/conversation/ui/blocks/ui";
import { CINE_PILL_ACTION, CineCard, CineDate, CinePill } from "@/features/conversation/ui/blocks/CineCard";
import { eventDayParts, eventDetailHref, formatEventWhen } from "@/lib/places-ui";
import { cn, safeHref } from "@/lib/utils";
import { ticketSellerLabel } from "@/lib/ticket-provider";

export type NearbyEvent = { title: string; url: string; date?: string; venue?: string; source: string; imageUrl?: string };

/**
 * An event, as Discover and the nearby lists show it: the shared cinematic `CineCard`, the same anatomy Roam
 * uses for a place or a stay (full photo, title, frosted pills, the action at the bottom right). Opens the
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
  const day = eventDayParts(event.date);
  const when = formatEventWhen(event.date);
  return (
    <div className={cn("h-full", className)}>
      <CineCard
        label={`Open ${event.title}`}
        onOpen={open}
        href={href}
        compact={compact}
        wide={phoneRow}
        selected={selected}
        src={event.imageUrl}
        alt={event.title}
        glyph={CalendarDays}
        topLeft={day ? <CineDate month={day.month} day={day.day} /> : undefined}
        eyebrow={event.venue}
        title={event.title}
        meta={[when, event.venue].filter(Boolean).join(" · ")}
        // A date is never invented: with none, the card says so.
        pills={<CinePill>{when ?? "Date to be announced"}</CinePill>}
        foot={seller ? <p className="truncate text-[0.8125rem] text-white/70">via {seller}</p> : undefined}
        action={
          comparing ? undefined : (
            <a href={safeHref(event.url)} target="_blank" rel="noreferrer noopener" aria-label={`Tickets: ${event.title}`} className={CINE_PILL_ACTION}>
              Tickets <ArrowUpRight className="size-4" aria-hidden />
            </a>
          )
        }
        overlay={comparing ? <CompareMark selected={selected} /> : undefined}
        row={{
          meta: <span className="font-medium text-coral-ink">{when ?? "Date to be announced"}</span>,
          sub: seller ? `via ${seller}` : undefined,
          action: comparing ? undefined : (
            <a href={safeHref(event.url)} target="_blank" rel="noreferrer noopener" aria-label={`Tickets: ${event.title}`} className="grid size-10 place-items-center rounded-full border border-border bg-background transition-transform active:scale-95">
              <Ticket className="size-[18px]" aria-hidden />
            </a>
          ),
        }}
      />
    </div>
  );
}
