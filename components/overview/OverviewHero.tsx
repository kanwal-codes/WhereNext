"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Loader2, MapPin, Pencil } from "lucide-react";
import { Reveal, WordReveal } from "@/components/motion-primitives";
import { TripCover } from "@/components/trips/TripCover";
import type { TripSummary } from "@/components/trips/types";
import { cn } from "@/lib/utils";
import { coverText } from "@/lib/trip-cover";

export type HeroFact = { icon: LucideIcon; label: string; value: string | null; desc?: string };

export type RenameControl = {
  editing: boolean;
  draft: string;
  saving: boolean;
  start: () => void;
  setDraft: (value: string) => void;
  save: () => void;
  cancel: () => void;
};

/**
 * The opening shot of a trip: the destination photo running edge to edge and slowly pushing in,
 * the trip's name set huge, and a frosted strip of the facts that matter (dates, who, budget,
 * from). Everything that sits on the photo is white over a graded scrim, and switches to dark
 * text on the warm wash used when a trip has no photo yet.
 */
export function OverviewHero({
  trip,
  destination,
  statusText,
  facts,
  rename,
}: {
  trip: TripSummary;
  destination: string;
  statusText: string | null;
  facts: HeroFact[];
  rename: RenameControl;
}) {
  return (
    <section aria-label={`${trip.name || destination} overview`}>
      <TripCover
        trip={trip}
        size="feature"
        typeLed={false}
        parallax
        width={1600}
        imageClassName="hero-drift"
        className="flex min-h-[34rem] flex-col justify-end sm:min-h-[40rem] lg:min-h-[44rem]"
      >
        {({ photo }) => (
          <>
            {/* The grade: a dark top for the chips, a deep bottom for the title, and a pool behind the words. */}
            <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[2] scrim-v transition-opacity duration-1000", photo ? "opacity-100" : "opacity-0")} />
            <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(85%_65%_at_22%_88%,rgba(0,0,0,0.6),transparent)] transition-opacity duration-1000", photo ? "opacity-100" : "opacity-0")} />

            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-5 pt-5 sm:px-8 sm:pt-7">
              {statusText ? (
                <Reveal delay={0.1}>
                  <span suppressHydrationWarning className="photo-chip">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-coral" />
                    {statusText}
                  </span>
                </Reveal>
              ) : (
                <span />
              )}
              <Reveal delay={0.15}>
                <button
                  type="button"
                  onClick={rename.start}
                  aria-label="Rename trip"
                  title="Rename trip"
                  className="daisy-btn daisy-btn-circle daisy-btn-sm border-border/60 bg-background/88 text-foreground shadow-none hover:bg-background"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </Reveal>
            </div>

            <div className={cn("relative z-10 mx-auto w-full max-w-6xl px-5 pt-40 pb-6 transition-colors duration-1000 sm:px-8 sm:pb-9", photo ? "text-white" : "text-foreground")}>
              <Reveal delay={0.1}>
                <p className={cn("flex items-center gap-1.5 text-sm font-medium tracking-[0.16em] uppercase transition-colors duration-1000", photo ? "text-white/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]" : "text-muted-foreground")}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {/* "London, England, United Kingdom" is a provider string; the place a traveller names is "London, United Kingdom". */}
                    {(() => { const { city, country } = coverText({ name: destination, destination }); return country && country !== city ? `${city}, ${country}` : city; })()}
                  </span>
                </p>
              </Reveal>

              {rename.editing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename.save();
                  }}
                  className="mt-3 flex max-w-3xl items-center gap-3"
                >
                  <input
                    autoFocus
                    value={rename.draft}
                    onChange={(event) => rename.setDraft(event.target.value)}
                    onBlur={rename.save}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") rename.cancel();
                    }}
                    disabled={rename.saving}
                    aria-label="Trip name"
                    className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background/90 px-4 py-2 font-display text-3xl text-foreground shadow-soft outline-none backdrop-blur focus:border-foreground/40 sm:text-5xl"
                  />
                  <button type="submit" disabled={rename.saving} aria-label="Save trip name" className="daisy-btn daisy-btn-circle border-border/60 bg-background/90 text-foreground shadow-none backdrop-blur">
                    {rename.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                </form>
              ) : (
                <WordReveal
                  text={trip.name || destination}
                  delay={0.25}
                  className={cn("mt-3 max-w-4xl font-display text-5xl leading-[0.96] tracking-tight text-balance sm:text-7xl lg:text-8xl", photo && "[text-shadow:0_2px_30px_rgba(0,0,0,0.5)]")}
                />
              )}

              <Reveal delay={0.55}>
                <div
                  suppressHydrationWarning
                  className={cn(
                    "daisy-stats mt-8 w-full rounded-2xl border transition-colors duration-1000 max-sm:grid max-sm:grid-flow-row max-sm:grid-cols-2 sm:w-auto [&_.daisy-stat-value]:overflow-visible [&_.daisy-stat-value]:leading-tight [&_.daisy-stat-value]:whitespace-normal [&>.daisy-stat]:min-w-0 [&>.daisy-stat]:px-5 [&>.daisy-stat]:py-3.5",
                    photo
                      ? "glass-photo [&_.daisy-stat-desc]:text-white/70 [&_.daisy-stat-title]:text-white/70 [&>.daisy-stat]:border-white/20"
                      : "border-border/60 bg-background/82 [&>.daisy-stat]:border-border/70",
                  )}
                >
                  {facts.map((fact) => (
                    <div key={fact.label} className="daisy-stat">
                      <div className="daisy-stat-title flex items-center gap-1.5 text-2xs tracking-[0.1em] uppercase">
                        <fact.icon className="h-3 w-3" /> {fact.label}
                      </div>
                      <div className={cn("daisy-stat-value font-display text-xl tracking-tight tabular-nums sm:text-2xl", !fact.value && "opacity-60")}>{fact.value ?? "Not set"}</div>
                      {fact.desc && <div className="daisy-stat-desc">{fact.desc}</div>}
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </>
        )}
      </TripCover>
    </section>
  );
}
