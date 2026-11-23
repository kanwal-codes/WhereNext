"use client";

import { ArrowRight } from "lucide-react";
import { NewTripLink } from "@/components/trips/NewTripLink";
import { Reveal } from "@/components/motion-primitives";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { cn } from "@/lib/utils";

const EMPTY_PHOTOS = [
  { src: "/design/land-city.jpg", tilt: "-rotate-2" },
  { src: "/design/land-coast.jpg", tilt: "rotate-[7deg]" },
  { src: "/design/land-mountains.jpg", tilt: "-rotate-[12deg]" },
];

/** What the home shows before the first trip: three postcards and a way in. */
export function EmptyTrips() {
  return (
    <Reveal>
      <div className="mt-8 grid items-center gap-10 overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16 max-lg:mt-0 max-lg:gap-0 max-lg:border-0 max-lg:bg-muted/70 max-lg:shadow-none">
        {/* A daisyUI stack: three inspiration photos fanned like postcards on a table. */}
        <div className="daisy-stack mx-auto h-64 w-full max-w-sm sm:h-72 max-lg:hidden" aria-hidden>
          {EMPTY_PHOTOS.map((photo) => (
            <div key={photo.src} className={cn("overflow-hidden rounded-2xl border border-border/60 shadow-lift", photo.tilt)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand photo */}
              <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
        <div className="text-center lg:text-left">
          <RoamMark state="idle" size={72} label="Roam" className="mx-auto text-foreground max-lg:hidden lg:mx-0" />
          <h3 className="mt-5 font-display text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl max-lg:mt-0 max-lg:text-xl max-lg:tracking-[-0.015em]">
            <span className="lg:hidden">No trips yet</span>
            <span className="max-lg:hidden">Start with a place, or just a feeling about one.</span>
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft max-lg:mx-auto max-lg:mt-1.5 max-lg:max-w-[16rem] max-lg:text-body">
            <span className="lg:hidden">Tell Roam where you’re thinking of going, or just a feeling. It takes shape as you talk.</span>
            <span className="max-lg:hidden">You only need a name and a destination. Dates, budget and who&rsquo;s coming can all come out of the conversation later. Or tell Roam what you&rsquo;re after in the box above.</span>
          </p>
          <NewTripLink className="btn-primary mt-7 max-lg:mt-5">
            {(spinner) => <>Create your first trip {spinner ?? <ArrowRight className="size-4" />}</>}
          </NewTripLink>
        </div>
      </div>
    </Reveal>
  );
}
