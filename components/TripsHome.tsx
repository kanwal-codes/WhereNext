"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, MapPin, Plus, Users } from "lucide-react";
import { Hero } from "@/components/Hero";
import { Reveal, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";

export type TripSummary = {
  id: string;
  name: string;
  destination: string;
  origin: string | null;
  duration_days: number | null;
  travelers: number | null;
};

export function TripsHome({ trips }: { trips: TripSummary[] }) {
  return (
    <div className="min-h-screen">
      <Hero image="/design/trip-hero.jpg" alt="Warm rooftops at dusk" className="h-[300px] sm:h-[380px]">
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
            <Reveal delay={0.2}>
              <p className="eyebrow">Next Place to Be</p>
              <WordReveal
                text="Trips you're thinking about."
                delay={0.3}
                className="mt-3 max-w-2xl font-display text-4xl leading-[1.15] sm:text-5xl"
              />
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
                Talk it through, and the plan builds itself alongside the conversation.
              </p>
            </Reveal>
          </div>
        </div>
      </Hero>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <h2 className="min-w-0 font-display text-xl">
            {trips.length > 0 ? `${trips.length} trip${trips.length === 1 ? "" : "s"}` : "No trips yet"}
          </h2>
          <Link
            href="/trips/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4" /> Create new trip
          </Link>
        </div>

        {trips.length === 0 ? (
          <Reveal>
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <h3 className="mx-auto max-w-md font-display text-2xl leading-snug">
                Start with a place, or just a feeling about one.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                You only need a name and a destination. Dates, budget, who&rsquo;s coming — all of
                that can come out of the conversation later.
              </p>
              <Link
                href="/trips/new"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Create your first trip <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <Stagger className="mt-7 grid gap-5 lg:grid-cols-2" delay={0.1}>
            {trips.map((trip) => (
              <StaggerItem key={trip.id}>
                <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block h-full rounded-2xl border border-border bg-card p-6 shadow-soft"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-2xl">{trip.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {trip.destination}
                      </p>
                    </div>

                    <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <CalendarDays className="h-3 w-3" /> Days
                        </dt>
                        <dd className="mt-1 truncate">{trip.duration_days ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <Users className="h-3 w-3" /> Travellers
                        </dt>
                        <dd className="mt-1 truncate">{trip.travelers ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <MapPin className="h-3 w-3" /> From
                        </dt>
                        <dd className="mt-1 truncate">{trip.origin || "—"}</dd>
                      </div>
                    </dl>
                  </Link>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
