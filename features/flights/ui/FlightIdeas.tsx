"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Reveal } from "@/components/motion-primitives";
import { cachedGet } from "@/lib/client/cached-get";
import { cn } from "@/lib/utils";
import { ideasFor, shortPlace } from "../domain/flights-page";

/** Trips ask their own routes; the home page asks the trip-free ones. */
const base = (tripId: string | null) => (tripId ? `/api/trips/${tripId}` : "/api/flights");

/** A place's cover photograph, found the way the trip covers are (cached by the browser for a few minutes, so a card does not ask twice). */
function useCityPhoto(tripId: string | null, city: string) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await cachedGet(`${base(tripId)}/cover?destination=${encodeURIComponent(city)}`, { ttlMs: 30 * 60_000 });
        const body = (await res.json()) as { photoName?: string | null };
        if (!live) return;
        if (body.photoName) setSrc(`${tripId ? `/api/trips/${tripId}/places/google` : "/api/flights"}/photo?name=${encodeURIComponent(body.photoName)}&w=640`);
        else setFailed(true);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [tripId, city]);
  return { src, failed };
}

function IdeaCard({ tripId, city, delay, onPick }: { tripId: string | null; city: string; delay: number; onPick: (city: string) => void }) {
  const { src, failed } = useCityPhoto(tripId, city);
  const [name, ...rest] = city.split(",");
  const [loaded, setLoaded] = useState(false);
  return (
    <Reveal delay={delay} y={12}>
      <button
        type="button"
        onClick={() => onPick(city)}
        aria-label={`Flights to ${shortPlace(city)}`}
        className="group relative block aspect-[4/5] w-full overflow-hidden rounded-3xl bg-muted text-left text-white transition-transform duration-200 ease-out active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- the proxied photo is already sized to the card
          <img src={src} alt="" loading="lazy" onLoad={() => setLoaded(true)} className={cn("absolute inset-0 size-full object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.04]", loaded ? "opacity-100" : "opacity-0")} />
        ) : failed ? (
          <span className="absolute inset-0 grid place-items-center text-muted-foreground"><MapPin className="size-7" aria-hidden /></span>
        ) : null}
        {!loaded && !failed && <span aria-hidden className="skeleton absolute inset-0" />}
        <span aria-hidden className="scrim-b absolute inset-0" />
        <span className="absolute inset-x-4 bottom-4">
          <span className="block font-display text-xl leading-tight font-medium tracking-[-0.015em]">{name}</span>
          {rest.length > 0 && <span className="mt-0.5 block text-sm text-white/80">{rest.join(",").trim()}</span>}
        </span>
      </button>
    </Reveal>
  );
}

/** Where people fly, as photographs. A tap picks the place and opens the search: nothing is priced until days are chosen. */
export function FlightIdeas({ tripId, origin, destination, onPick }: { tripId: string | null; origin?: string | null; destination?: string | null; onPick: (city: string) => void }) {
  const ideas = useMemo(() => ideasFor({ origin, destination }, 6), [origin, destination]);
  return (
    <section aria-labelledby="flight-ideas" className="mt-1">
      <h2 id="flight-ideas" className="font-display text-xl font-medium tracking-[-0.015em]">{origin ? `Ideas from ${shortPlace(origin)}` : "Ideas"}</h2>
      <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {ideas.map((city, i) => <IdeaCard key={city} tripId={tripId} city={city} delay={0.05 + i * 0.06} onPick={onPick} />)}
      </div>
    </section>
  );
}
