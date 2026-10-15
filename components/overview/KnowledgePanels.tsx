"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { photoProxyUrl } from "@/lib/places-ui";
import { categoryLabel, type TastePicture } from "@/lib/trip-overview";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { cn } from "@/lib/utils";
import type { MosaicPlace } from "@/components/overview/PlacesMosaic";

const panel = "rounded-3xl border border-border/70 bg-card p-6 shadow-soft";

function Thumb({ tripId, place }: { tripId: string; place: MosaicPlace }) {
  const [failed, setFailed] = useState(false);
  const src = place.photoName && !failed ? photoProxyUrl(tripId, place.photoName, 240) : null;
  return (
    <TripArt seed={hashString(place.name)} className="h-12 w-12 shrink-0 rounded-xl">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center font-display text-xl text-foreground/40">{place.name.charAt(0)}</span>
      )}
    </TripArt>
  );
}

/** Saved places as a compact list with a thumbnail, so it reads as places and not a list of links. */
export function SavedPlacesList({ tripId, places }: { tripId: string; places: MosaicPlace[] }) {
  return (
    <section className={panel}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl tracking-tight">Saved places</h2>
        <span className="text-sm tabular-nums text-muted-foreground">{places.length}</span>
      </div>
      {places.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {places.map((place) => (
            <li key={place.id}>
              <Link href={`/trips/${tripId}/place/${place.id}`} className="group -mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-accent">
                <Thumb tripId={tripId} place={place} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium">{place.name}</span>
                  {place.category && <span className="block truncate text-xs text-muted-foreground">{categoryLabel(place.category)}</span>}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing saved yet.</p>
      )}
    </section>
  );
}

/** The hard edges: what to avoid and what to eat, as chips. */
export function ConstraintsPanel({ taste }: { taste: TastePicture }) {
  const any = taste.avoids.length + taste.dietary.length > 0;
  return (
    <section className={panel}>
      <h2 className="font-display text-2xl tracking-tight">Constraints</h2>
      <p className="mt-1 text-sm text-muted-foreground">Hard edges the plan has to respect.</p>
      {any ? (
        <div className="mt-4 space-y-4">
          {taste.avoids.length > 0 && (
            <div>
              <p className="mb-2 text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Avoid</p>
              <div className="flex flex-wrap gap-2">
                {taste.avoids.map((item) => (
                  <span key={item} className="daisy-badge h-7 border-border bg-muted px-3 text-sm text-muted-foreground line-through decoration-muted-foreground/50">{item}</span>
                ))}
              </div>
            </div>
          )}
          {taste.dietary.length > 0 && (
            <div>
              <p className="mb-2 text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Dietary</p>
              <div className="flex flex-wrap gap-2">
                {taste.dietary.map((item) => (
                  <span key={item} className="daisy-badge h-7 border-coral/30 bg-coral/10 px-3 text-sm">{item}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">None captured yet.</p>
      )}
    </section>
  );
}

/** What has not been decided, each as a pill; nothing shown as a problem. */
export function UndecidedPanel({ items, tripId }: { items: string[]; tripId: string }) {
  return (
    <section className={cn(panel, "border-dashed bg-transparent shadow-none")}>
      <h2 className="font-display text-2xl tracking-tight">Still undecided</h2>
      <p className="mt-1 text-sm text-muted-foreground">Raised only when they start to matter.</p>
      {items.length > 0 ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item} className="daisy-badge h-7 border-border bg-background px-3 text-sm">
                <span aria-hidden className="mr-1 h-1.5 w-1.5 rounded-full bg-coral" />
                {item}
              </span>
            ))}
          </div>
          <Link href={`/trips/${tripId}/chat`} className="group mt-3 inline-flex items-center gap-1 py-2 text-sm font-medium text-primary transition-colors hover:underline">
            Settle them with Roam <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding.</p>
      )}
    </section>
  );
}
