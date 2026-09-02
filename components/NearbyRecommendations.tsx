"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BedDouble, Compass, Loader2, Star, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { Reveal } from "@/components/motion-primitives";
import { photoProxyUrl } from "@/lib/places-ui";

const SECTIONS: Array<{ key: string; label: string; icon: LucideIcon; q: (name: string, city: string) => string }> = [
  { key: "stay", label: "Where to stay nearby", icon: BedDouble, q: (n, c) => `hotels near ${n} ${c}`.trim() },
  { key: "eat", label: "Eat nearby", icon: UtensilsCrossed, q: (n, c) => `restaurants near ${n} ${c}`.trim() },
  { key: "do", label: "Things to do nearby", icon: Compass, q: (n, c) => `things to do near ${n} ${c}`.trim() },
];

function MiniCard({ tripId, place }: { tripId: string; place: Place }) {
  const photo = photoProxyUrl(tripId, place.photoNames?.[0]);
  return (
    <Link
      href={`/trips/${tripId}/place/${encodeURIComponent(place.providerId)}`}
      className="block w-[196px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy
        <img src={photo} alt={place.name} width={196} height={110} loading="lazy" className="h-28 w-full object-cover" />
      ) : (
        <div className="h-28 w-full bg-muted" />
      )}
      <div className="p-3">
        <p className="truncate text-sm font-medium">{place.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {typeof place.rating === "number" && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-current text-coral" />
              {place.rating.toFixed(1)}
            </span>
          )}
          <span className="truncate">{(place.category ?? "").replaceAll("_", " ")}</span>
        </p>
      </div>
    </Link>
  );
}

export function NearbyRecommendations({
  tripId,
  excludeId,
  anchorName,
  cityHint = "",
}: {
  tripId: string;
  excludeId: string;
  anchorName: string;
  cityHint?: string;
}) {
  const [results, setResults] = useState<Record<string, Place[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResults({});
    Promise.all(
      SECTIONS.map((s) =>
        fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(s.q(anchorName, cityHint))}`)
          .then((r) => (r.ok ? r.json() : { places: [] }))
          .then((b) => [s.key, ((b.places ?? []) as Place[]).filter((p) => p.providerId !== excludeId).slice(0, 8)] as const)
          .catch(() => [s.key, [] as Place[]] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) {
        setResults(Object.fromEntries(pairs));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, excludeId, anchorName, cityHint]);

  const anyResults = Object.values(results).some((r) => r.length > 0);

  if (loading) {
    return (
      <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Finding what&rsquo;s around {anchorName}…
      </div>
    );
  }
  if (!anyResults) return null;

  return (
    <div className="mt-12 space-y-8 border-t border-border pt-8">
      <div>
        <p className="eyebrow">Around here</p>
        <p className="mt-1 text-sm text-muted-foreground">Places close to {anchorName} — tap any to open it.</p>
      </div>
      {SECTIONS.map((s, i) => {
        const items = results[s.key] ?? [];
        if (items.length === 0) return null;
        return (
          <Reveal key={s.key} delay={0.05 * i}>
            <section>
              <h3 className="flex items-center gap-2 font-display text-lg">
                <s.icon className="h-4 w-4 text-coral" /> {s.label}
              </h3>
              <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-slim pb-1">
                {items.map((place) => (
                  <MiniCard key={place.providerId} tripId={tripId} place={place} />
                ))}
              </div>
            </section>
          </Reveal>
        );
      })}
    </div>
  );
}
