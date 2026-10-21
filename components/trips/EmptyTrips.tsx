"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
      <div className="mt-8 grid items-center gap-10 overflow-hidden rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        {/* A daisyUI stack: three inspiration photos fanned like postcards on a table. */}
        <div className="daisy-stack mx-auto h-64 w-full max-w-sm sm:h-72" aria-hidden>
          {EMPTY_PHOTOS.map((photo) => (
            <div key={photo.src} className={cn("overflow-hidden rounded-2xl border border-border/60 shadow-lift", photo.tilt)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand photo */}
              <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
        <div className="text-center lg:text-left">
          <RoamMark state="idle" size={72} label="Roam" className="mx-auto text-foreground lg:mx-0" />
          <h3 className="mt-5 font-display text-3xl leading-[1.1] tracking-tight text-balance sm:text-4xl">
            Start with a place, or just a feeling about one.
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground max-lg:mx-auto">
            You only need a name and a destination. Dates, budget and who&rsquo;s coming can all come out of the conversation later. Or tell Roam what you&rsquo;re after in the box above.
          </p>
          <Link href="/trips/new" className="btn-primary mt-7">
            Create your first trip <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
