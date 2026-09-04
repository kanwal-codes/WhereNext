"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useTripData } from "@/components/TripDataProvider";
import { coarseKind } from "@/features/places/ui/discoverTaxonomy";
import { readStayDecision } from "@/packages/contracts/stay";
import type { RoutePlan } from "@/packages/contracts/route-plan";
import { RouteTimeline } from "@/features/maps/ui/RouteTimeline";
import { TransportSurface, type TransportPreset } from "@/features/transport/ui/TransportSurface";
import { AiSearchBar } from "@/components/AiSearchBar";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { cn } from "@/lib/utils";
import type { MapPin as Pin, MapLeg } from "@/components/TripMap";

const TripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="grid h-[52vh] min-h-[320px] place-items-center rounded-2xl border border-border bg-muted/40 text-sm text-muted-foreground">Loading map…</div>,
});

type Row = { places?: { id: string; name: string; provider_id?: string; category?: string | null; metadata?: { latitude?: number; longitude?: number } | null } };
type ItineraryRow = { id: string; title: string; day_index: number; metadata?: { latitude?: number; longitude?: number; source?: string; provider_id?: string } | null };

const coords = (m?: { latitude?: number; longitude?: number } | null) => {
  const lng = Number(m?.longitude);
  const lat = Number(m?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0) ? { lng, lat } : null;
};

const kindFor = (category?: string | null): Pin["kind"] => {
  const k = coarseKind(category);
  return k === "Eat" ? "eat" : k === "Stay" ? "stay" : k === "Nature" || k === "Do" ? "do" : "see";
};

export function MapSurface({ tripId }: { tripId: string }) {
  const { data } = useTripData();
  const [tab, setTab] = useState<"trip" | "browse">("trip");
  const [activeDay, setActiveDay] = useState<number | "all">("all");

  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = [];
    for (const i of (data?.itinerary ?? []) as ItineraryRow[]) {
      const c = coords(i.metadata);
      const providerId = i.metadata?.provider_id;
      if (c) out.push({ id: `it-${i.id}`, name: i.title, ...c, kind: "see", day: i.day_index, href: providerId ? `/trips/${tripId}/place/${encodeURIComponent(providerId)}` : undefined });
    }
    const pinnedKey = new Set(out.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`));
    for (const s of (data?.savedPlaces ?? []) as Row[]) {
      const p = s.places;
      const c = coords(p?.metadata);
      if (p && c && !pinnedKey.has(`${c.lng.toFixed(4)},${c.lat.toFixed(4)}`)) {
        out.push({ id: p.id, name: p.name, ...c, kind: kindFor(p.category), href: p.provider_id ? `/trips/${tripId}/place/${encodeURIComponent(p.provider_id)}` : undefined });
      }
    }
    if (lockedStay && lockedStay.latitude != null && lockedStay.longitude != null) {
      out.unshift({ id: "stay", name: lockedStay.hotelName, lng: lockedStay.longitude, lat: lockedStay.latitude, kind: "stay", href: `/trips/${tripId}/stay/${encodeURIComponent(lockedStay.hotelId)}` });
    }
    return out;
  }, [data?.itinerary, data?.savedPlaces, lockedStay, tripId]);

  // Day-by-day route plan (real transit legs). Fetched once; refreshes when the itinerary changes.
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const itineraryKey = ((data?.itinerary ?? []) as ItineraryRow[]).map((i) => `${i.id}:${i.day_index}`).join(",");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trips/${tripId}/route-plan`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => !cancelled && setPlan(body as RoutePlan | null))
      .catch(() => !cancelled && setPlan(null));
    return () => { cancelled = true; };
  }, [tripId, itineraryKey]);

  const days = useMemo(() => {
    const fromPins = pins.map((p) => p.day).filter((d): d is number => typeof d === "number");
    const fromPlan = (plan?.days ?? []).map((d) => d.day);
    return Array.from(new Set([...fromPins, ...fromPlan])).sort((a, b) => a - b);
  }, [pins, plan]);
  const shown = pins.filter((p) => activeDay === "all" || p.day === activeDay);

  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const planDays = activeDay === "all" ? (plan?.days ?? []) : (plan?.days ?? []).filter((d) => d.day === activeDay);
  const mapLegs: MapLeg[] = planDays.flatMap((d, di) =>
    d.legs.map((l, li) => ({
      polyline: l.polyline,
      mode: l.mode,
      dim: activeDay !== "all" && hoverLeg != null && !(di === 0 && li === hoverLeg),
    })),
  );

  // Browse mode: an A→B route the user picked, drawn on the map.
  const [browseLegs, setBrowseLegs] = useState<MapLeg[] | null>(null);
  const browse = useMemo(() => ({ legs: browseLegs ?? [] }), [browseLegs]);
  const [gaPreset, setGaPreset] = useState<TransportPreset | undefined>();
  const applyGaDirective = (d: AiSearchDirective) =>
    setGaPreset({ from: d.from, to: d.to, modes: d.modes ?? [], nonce: Date.now() });

  const origin = data?.trip?.origin ?? "";
  const destination = data?.trip?.destination ?? "";

  // Fall-back centre for Browse when nothing is pinned yet — geocode the destination once.
  const [center, setCenter] = useState<[number, number] | undefined>();
  useEffect(() => {
    if (!destination || pins.length > 0) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}/geocode?q=${encodeURIComponent(destination)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => !cancelled && p && setCenter([p.lng, p.lat]))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tripId, destination, pins.length]);

  return (
    <div className="min-w-0 space-y-5">
      {/* mode pill */}
      <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
        {(["trip", "browse"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-full px-4 py-1.5 font-medium transition-colors", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t === "trip" ? "My trip" : "Browse"}
          </button>
        ))}
      </div>

      {tab === "trip" ? (
        pins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
            <MapPin className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
            Add stops to your itinerary or save places from Discover — they&rsquo;ll appear on the map here, day by day.
          </p>
        ) : (
          <>
            {days.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-slim pb-1">
                <button
                  type="button"
                  onClick={() => setActiveDay("all")}
                  className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", activeDay === "all" ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
                >
                  Whole trip
                </button>
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setActiveDay(d)}
                    className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium", activeDay === d ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft")}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            )}

            <TripMap pins={pins} legs={mapLegs} activeDay={activeDay} />

            {planDays.length > 0 && planDays.some((d) => d.legs.length > 0) ? (
              <div className="space-y-6">
                {planDays.map((d) => (
                  <RouteTimeline key={d.day} day={d} onHoverLeg={activeDay === "all" ? undefined : setHoverLeg} />
                ))}
              </div>
            ) : (
              <>
                <ol className="space-y-1.5">
                  {shown.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2.5 text-sm">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: { stay: "#e2603f", eat: "#d9932b", see: "#3b82c4", do: "#3f9d6b", event: "#8b5cf6", saved: "#8a8a8a" }[p.kind] }}>
                        {i + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                      {p.day != null && <span className="shrink-0 text-xs text-muted-foreground">Day {p.day}</span>}
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-muted-foreground">
                  {plan ? "Working out how to get between these stops…" : "Numbered in visit order."} Pick a day to see the route leg by leg.
                </p>
              </>
            )}
          </>
        )
      ) : (
        <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="order-2 min-w-0 space-y-4 lg:order-1">
            <AiSearchBar
              tripId={tripId}
              scope="getting-around"
              placeholder={`Ask — “${origin || "Toronto"} to ${destination || "Montreal"} by train”, “cheapest way to the airport”`}
              onDirective={applyGaDirective}
            />
            <p className="text-xs text-muted-foreground">
              Search any two places, then pick a result to trace it on the map — stops, line names, fares and times. Say “by flight”, “by train” or “driving” to narrow it.
            </p>
            <TransportSurface tripId={tripId} origin={origin} destination={destination} preset={gaPreset} onRoute={setBrowseLegs} />
          </div>
          <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-4">
            <TripMap pins={[]} activeDay="all" center={center} browse={browseLegs && browseLegs.length ? browse : null} />
          </div>
        </div>
      )}
    </div>
  );
}
