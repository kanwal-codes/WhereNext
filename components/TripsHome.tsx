"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, Loader2, MapPin, Plus, Trash2, UserRound, Users } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Hero } from "@/components/Hero";
import { Reveal, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";
import { notifyToast } from "@/lib/application/toast";
import { tripWhen } from "@/lib/trip-dates";
import { useIsDarkMode } from "@/lib/use-dark-mode";

export type TripSummary = {
  id: string;
  name: string;
  destination: string | null;
  origin: string | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
};

export function TripsHome({ trips }: { trips: TripSummary[] }) {
  const [list, setList] = useState(trips);
  const [deleting, setDeleting] = useState<string | null>(null);
  const isDark = useIsDarkMode();

  async function removeTrip(trip: TripSummary) {
    if (!window.confirm(`Delete "${trip.name}" and everything in it? This cannot be undone.`)) return;
    setDeleting(trip.id);
    const response = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
    setDeleting(null);
    if (response.ok) {
      setList((current) => current.filter((t) => t.id !== trip.id));
      notifyToast(`"${trip.name}" deleted.`, "success");
    } else {
      notifyToast("That trip couldn't be deleted. Try again.", "error");
    }
  }

  return (
    <div className="min-h-screen">
      <Hero image={isDark ? "/design/trip-hero-night.jpg" : "/design/trip-hero.jpg"} alt="Warm rooftops at dusk" className="h-[300px] sm:h-[380px]">
        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <BrandMark variant="compact" />
              <BrandMark variant="text" className="hidden sm:inline" />
            </Link>
            <Link
              href="/account"
              title="Account"
              aria-label="Account"
              className="inline-flex h-9 w-9 items-center justify-center text-foreground transition-opacity hover:opacity-70"
            >
              <UserRound className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
            <Reveal delay={0.2}>
              <WordReveal
                text="Trips you're thinking about."
                delay={0.3}
                className="max-w-2xl font-display text-4xl leading-[1.15] sm:text-5xl"
              />
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
                Talk it through, and the plan builds itself alongside the conversation.
              </p>
            </Reveal>
          </div>
        </div>
      </Hero>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <h2 className="min-w-0 font-display text-xl">
            {list.length > 0 ? `${list.length} trip${list.length === 1 ? "" : "s"}` : "No trips yet"}
          </h2>
          <Link href="/trips/new" className="btn-primary w-fit shrink-0 sm:justify-self-end">
            <Plus className="h-4 w-4" /> Create new trip
          </Link>
        </div>

        {list.length === 0 ? (
          <Reveal>
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <h3 className="mx-auto max-w-md font-display text-2xl leading-snug">
                Start with a place, or just a feeling about one.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                You only need a name and a destination. Dates, budget, who&rsquo;s coming — all of
                that can come out of the conversation later.
              </p>
              <Link href="/trips/new" className="btn-primary mt-6">
                Create your first trip <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        ) : (
          <Stagger className="mt-7 grid gap-5 lg:grid-cols-2" delay={0.1}>
            {list.map((trip) => (
              <StaggerItem key={trip.id}>
                <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="group relative">
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block h-full rounded-2xl border border-border bg-card p-6 shadow-soft"
                  >
                    <div className="min-w-0 pr-9">
                      <h3 className="truncate font-display text-2xl">{trip.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {trip.destination || "Destination not set"}
                      </p>
                    </div>

                    <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                      <div className="col-span-2 min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <CalendarDays className="h-3 w-3" /> Dates
                        </dt>
                        <dd className="mt-1 truncate">{tripWhen(trip.start_date, trip.end_date, trip.duration_days)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <Users className="h-3 w-3" /> Travellers
                        </dt>
                        <dd className="mt-1 truncate">{trip.travelers ?? "Not set"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                          <MapPin className="h-3 w-3" /> From
                        </dt>
                        <dd className="mt-1 truncate">{trip.origin || "Not set"}</dd>
                      </div>
                    </dl>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void removeTrip(trip)}
                    disabled={deleting === trip.id}
                    aria-label={`Delete ${trip.name}`}
                    className="absolute top-4 right-4 rounded-full border border-border bg-background/90 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                  >
                    {deleting === trip.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
