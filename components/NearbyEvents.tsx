"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { Reveal } from "@/components/motion-primitives";

/** "What's on nearby" — Ticketmaster + Eventbrite events for a place's city. */
export function NearbyEvents({ tripId, location, query = "" }: { tripId: string; location: string; query?: string }) {
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location) {
      setLoading(false);
      return;
    }
    let cancelled = false;
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
    fetch(`/api/trips/${tripId}/events?${qs}`)
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
    };
  }, [tripId, location, query]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Looking for events near {location}…
      </div>
    );
  }
  if (!events || events.length === 0) return null;

  return (
    <Reveal>
      <section>
        <h2 className="flex items-center gap-2 font-display text-xl">
          <CalendarClock className="h-4 w-4 text-coral" /> What&rsquo;s on nearby
        </h2>
        <div className="mt-3 -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-slim px-5 pb-1 sm:mx-0 sm:px-0">
          {events.map((event) => (
            <EventCard key={event.url} tripId={tripId} event={event} className="w-[240px] shrink-0 snap-start" />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Confirm dates and availability on the ticket page.</p>
      </section>
    </Reveal>
  );
}
