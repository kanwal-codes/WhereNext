"use client";

import { useEffect, useState } from "react";
import { useNearView } from "@/lib/use-near-view";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { Reveal } from "@/components/motion-primitives";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

/** "What's on nearby" — Ticketmaster + Eventbrite events for a place's city. */
export function NearbyEvents({ tripId, location, query = "" }: { tripId: string; location: string; query?: string }) {
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // A trip-search lookup, closed to guests (Roam only): the strip simply isn't shown.
  const { guest } = useGuest();
  // Below the fold in every detail view: fetch once someone scrolls toward it, not on open.
  const [nearRef, near] = useNearView<HTMLDivElement>();

  useEffect(() => {
    if (!location || guest) {
      setLoading(false);
      return;
    }
    if (!near) return;
    let cancelled = false;
    const controller = new AbortController();
    const qs = new URLSearchParams({ location });
    if (query) qs.set("query", query);
    // One events pull per city+query per session — this strip renders on every
    // stay/place detail open, and the list barely moves within a sitting.
    const cacheKey = `nearby-events:${tripId}:${qs.toString()}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setEvents(JSON.parse(cached) as NearbyEvent[]);
        setLoading(false);
        return () => { cancelled = true; };
      }
    } catch { /* ignore */ }
    setLoading(true);
    fetch(`/api/trips/${tripId}/events?${qs}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((body) => {
        if (!cancelled) {
          try { sessionStorage.setItem(cacheKey, JSON.stringify(body.events ?? [])); } catch { /* ignore */ }
          setEvents(body.events ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tripId, location, query, guest, near]);

  if (loading) {
    return (
      <div ref={nearRef} aria-busy="true" aria-label={`Loading events near ${location}`} className="space-y-3">
        <div className="h-6 w-40 skeleton rounded-md" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
        </div>
      </div>
    );
  }
  if (!events || events.length === 0) return null;

  const visibleEvents = expanded ? events : events.slice(0, 3);
  const hasMore = events.length > 3;

  return (
    <Reveal>
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">What&rsquo;s on nearby</h2>
          {hasMore && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
              aria-expanded={expanded}
              aria-controls="nearby-events-list"
              className="relative shrink-0 text-xs font-medium text-primary hover:underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
            >
              {expanded ? "Show less" : `See all ${events.length}`} <span aria-hidden="true">{expanded ? "↑" : "→"}</span>
            </button>
          )}
        </div>
        {/* Photo tiles, like "Other places to stay": a row of three on a laptop, a swipe row on a phone; "See all" lets them wrap into a grid. */}
        <ul
          id="nearby-events-list"
          className={cn(
            "mt-4",
            expanded
              ? "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3"
              : "no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0",
          )}
        >
          {visibleEvents.map((event) => (
            <li key={`${event.url}|${event.date ?? ""}`} className={cn(!expanded && "w-[62%] shrink-0 snap-start sm:w-auto")}>
              <EventCard tripId={tripId} event={event} tile />
            </li>
          ))}
        </ul>
      </section>
    </Reveal>
  );
}
