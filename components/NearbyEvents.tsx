"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarClock, ChevronUp, Loader2 } from "lucide-react";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { Reveal } from "@/components/motion-primitives";

/** "What's on nearby" — Ticketmaster + Eventbrite events for a place's city. */
export function NearbyEvents({ tripId, location, query = "" }: { tripId: string; location: string; query?: string }) {
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

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

  const visibleEvents = expanded ? events : events.slice(0, 3);
  const hasMore = events.length > 3;

  return (
    <Reveal>
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <CalendarClock className="h-4 w-4 text-coral" /> What&rsquo;s on nearby
          </h2>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {expanded ? "Show less" : "See more"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={expanded ? "all-events" : "featured-events"}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
            className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {visibleEvents.map((event) => (
              <EventCard key={event.url} tripId={tripId} event={event} className="w-full" />
            ))}
          </motion.div>
        </AnimatePresence>
        {expanded && (
          <p className="mt-2 text-[11px] text-muted-foreground">Confirm dates and availability on the ticket page.</p>
        )}
      </section>
    </Reveal>
  );
}
