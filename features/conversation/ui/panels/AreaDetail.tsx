"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Home, Loader2, MapPin } from "lucide-react";
import { Reveal } from "@/components/motion-primitives";
import { useTripData } from "@/components/TripDataProvider";
import { useTripPanelMaybe } from "@/components/TripPanelProvider";
import type { PanelState } from "@/components/TripPanelProvider";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { PlaceCardView } from "@/features/conversation/ui/blocks/MessageBlocks";
import { RouteMap, type RouteMapRequest } from "@/features/conversation/ui/blocks/RouteMap";
import { Badge, Meta, controlSecondary, type as typeScale } from "@/features/conversation/ui/blocks/ui";
import { areaCentre, feelTags, nearOnly, placeTabs, ringPoints, searchName, withoutArea } from "@/features/conversation/domain/areaPlaces";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { cachedGet } from "@/lib/client/cached-get";
import { photoProxyUrl } from "@/lib/places-ui";
import { cn } from "@/lib/utils";
import type { PlaceCard } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";

type AreaPanel = Extract<PanelState, { kind: "area" }>;
type Found = { status: "loading" } | { status: "error" } | { status: "ok"; places: PlaceCard[] };

const STEP = 6;
const CORAL = "#ec6a3a";

/** The trip's city for a search, or nothing while the destination is still a placeholder ("Somewhere in Europe (country not chosen yet)"). */
const realCity = (destination: string | null | undefined) => {
  const first = (destination ?? "").split(",")[0]?.trim() ?? "";
  return /somewhere|not chosen|\(/i.test(first) ? "" : first;
};

/** What the two buttons at the bottom ask Roam, for a neighbourhood and for a day trip. */
const ASKS = {
  area: (name: string): Array<[string, string]> => [["Places to stay here", `Show me places to stay in ${name}.`], ["What there is to do", `What are the best things to do in and around ${name}?`]],
  daytrip: (name: string): Array<[string, string]> => [["How to get there", `How do I get to ${name} for a day trip, and how long does it take each way?`], ["Plan the day", `Plan a day trip to ${name}: what to see, in what order, and when to head back.`]],
} as const;

/** Pills that scroll sideways on a narrow panel. The active one is ink on cream, the others sit quiet. */
function Pills({ label, items, active, onPick }: { label: string; items: Array<{ key: string; label: string }>; active: string; onPick: (key: string) => void }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar [scroll-padding-inline:1rem]">
      {items.map((item) => {
        const on = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(item.key)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200",
              on ? "border-ink bg-ink text-background" : "border-border bg-card text-ink-soft hover:border-ink/30 hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** One neighbourhood or day trip from a card, in full: where it is, what it is like, what to do there, and what to do about it. */
export function AreaDetail({ tripId, panel }: { tripId: string; panel: AreaPanel }) {
  const ctx = useTripPanelMaybe();
  const { data } = useTripData();
  const { guest, openGate } = useGuest();
  const item = panel.items[panel.active] ?? panel.items[0];
  const isArea = panel.optionKind === "area";
  const city = realCity(data?.trip?.destination);
  const place = searchName(item.name);
  // "Canal Saint-Martin and Oberkampf" reads long in a sentence: the first name is enough there.
  const short = place.split(/\s+(?:and|&)\s+/i)[0] || place;
  const tabs = useMemo(() => placeTabs(item.tags, panel.optionKind), [item.tags, panel.optionKind]);
  const [tab, setTab] = useState(tabs[0].key);
  const [results, setResults] = useState<Record<string, Found>>({});
  const [shown, setShown] = useState(STEP);
  // Where the area is: "loading" until its own search comes back, then a point (or "none" if nothing could place it).
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null | "loading">("loading");
  const [saving, setSaving] = useState(false);
  // The tabs already searched successfully, so coming back to one does not search again.
  const done = useRef(new Set<string>());
  // Bumped by "Try again" so a failed tab is searched once more.
  const [attempt, setAttempt] = useState(0);

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const found = results[current.key];

  // First, find the area itself, so the map is centred on it and the tabs can keep to what is near it.
  useEffect(() => {
    if (guest) { setCentre(null); return; }
    const controller = new AbortController();
    cachedGet(`/api/trips/${tripId}/places?query=${encodeURIComponent(`${place}${city ? `, ${city}` : ""}`)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("places"))))
      .then((body: { places?: Place[] }) => setCentre(areaCentre(body.places ?? [])))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setCentre(null); });
    return () => controller.abort();
  }, [guest, tripId, place, city]);

  // Each tab is searched the first time it is opened, once the area is placed. The first ("Top picks") also tells where the area is, for the map.
  useEffect(() => {
    if (guest || centre === "loading" || done.current.has(current.key)) return;
    setResults((r) => ({ ...r, [current.key]: { status: "loading" } }));
    const controller = new AbortController();
    const query = `${current.query} in ${place}${city ? `, ${city}` : ""}`;
    const near = centre ? `&lat=${centre.lat}&lng=${centre.lng}` : "";
    const reach = isArea ? 1.6 : 30;
    cachedGet(`/api/trips/${tripId}/places?query=${encodeURIComponent(query)}${near}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("places"))))
      .then((body: { places?: Place[] }) => {
        const places = nearOnly(withoutArea(body.places ?? [], item.name), centre, reach).map((p): PlaceCard => ({ ...p, trust: "sourced", photoUrl: photoProxyUrl(tripId, p.photoNames?.[0], 640) }));
        done.current.add(current.key);
        setResults((r) => ({ ...r, [current.key]: { status: "ok", places } }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return; // superseded by a newer search for this tab
        setResults((r) => ({ ...r, [current.key]: { status: "error" } }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one search per tab; the centre only biases the ones opened after the first
  }, [current.key, guest, tripId, attempt, centre]);

  const mapRequest: RouteMapRequest | null = centre && centre !== "loading"
    ? {
        lines: [
          { points: ringPoints(centre.lat, centre.lng, isArea ? 650 : 4000), color: "#ffffff", width: 8 },
          { points: ringPoints(centre.lat, centre.lng, isArea ? 650 : 4000), color: CORAL, width: 4 },
        ],
        pins: [{ at: [centre.lng, centre.lat], color: "#27221e" }],
        size: { width: 640, height: 360 },
      }
    : null;

  const baseArea = ((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>).find((d) => d.kind === "stay_area")?.value as { area?: string } | undefined;
  const isBase = isArea && Boolean(baseArea?.area) && (baseArea!.area!.toLowerCase() === item.name.toLowerCase() || searchName(baseArea!.area!).toLowerCase() === place.toLowerCase());

  async function makeBase() {
    if (guest) return openGate("choose a base for the trip");
    if (saving || isBase) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/trips/${tripId}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "stay_area", value: { area: item.name }, idempotencyKey: "stay_area" }),
      });
      if (!response.ok) throw new Error("decision");
      announceWorkspaceChange("decision");
      notifyToast(`${short} is now your base.`, "success");
    } catch {
      notifyToast("Couldn’t save that. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  const ask = (prompt: string) => {
    panel.onAsk?.(prompt);
    ctx?.closePanel();
  };

  const feel = feelTags(item.tags);
  const visible = found?.status === "ok" ? found.places.slice(0, shown) : [];
  const left = found?.status === "ok" ? found.places.length - visible.length : 0;
  const switchTo = (name: string) => {
    const next = panel.items.findIndex((i) => i.name === name);
    if (next >= 0 && next !== panel.active) ctx?.openPanel({ ...panel, active: next });
  };

  return (
    <div className="space-y-7 px-4 pt-4 pb-12">
      {panel.items.length > 1 && (
        <Pills label={isArea ? "Areas" : "Day trips"} items={panel.items.map((i) => ({ key: i.name, label: searchName(i.name) }))} active={item.name} onPick={switchTo} />
      )}

      <Reveal y={10}>
        <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-coral-soft shadow-widget">
          {/* Until the map arrives (or if it never does: no key, offline), the card is a warm wash with the pin. */}
          <div aria-hidden className="absolute inset-0 grid place-items-center bg-gradient-to-br from-coral-soft via-coral-soft to-surface text-coral-ink">
            <MapPin className="size-14 opacity-60" strokeWidth={1.25} />
          </div>
          {mapRequest && <RouteMap request={mapRequest} label={`Map of ${item.name}`} fallback={null} />}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/35 to-transparent" />
          <span className="absolute top-3 left-3 inline-flex h-7 items-center rounded-full bg-white px-3 text-xs font-semibold text-ink shadow-soft">{isArea ? "Neighbourhood" : "Day trip"}{city ? ` · ${city}` : ""}</span>
          {centre === "loading" && !guest && <Loader2 className="absolute right-3 bottom-3 size-4 animate-spin text-white/90" aria-label="Finding it on the map" />}
        </div>
      </Reveal>

      <Reveal delay={0.05} y={10}>
        <section className="space-y-3">
          <h2 className="font-display text-title leading-[1.1] font-medium tracking-[-0.025em] text-balance">{item.name}</h2>
          <Meta items={[item.meta]} />
          {item.bestFor && <div><Badge tone="positive" icon={Check}>Best for {item.bestFor}</Badge></div>}
          <p className="text-[0.9375rem] leading-relaxed text-ink-soft text-pretty">{item.blurb}</p>
          {feel.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {feel.map((tag) => <Badge key={tag}>{tag}</Badge>)}
            </div>
          )}
        </section>
      </Reveal>

      {isArea && (
        <Reveal delay={0.1} y={10}>
          <section aria-label="Make this your base" className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-2xl border p-3.5 transition-colors", isBase ? "border-transparent bg-secondary" : "border-border bg-card")}>
            <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", isBase ? "bg-positive/15 text-positive" : "bg-coral-soft text-coral-ink")} aria-hidden>
              {isBase ? <Check className="size-5" /> : <Home className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 basis-44">
              <p className="text-sm font-semibold">{isBase ? `${short} is your base` : `Stay around ${short}?`}</p>
              <p className={cn(typeScale.meta, "leading-snug")}>{isBase ? "Roam plans stays, routes and days around it." : "Make it the trip’s base and Roam plans stays, routes and days around it."}</p>
            </div>
            {!isBase && (
              <button type="button" onClick={() => void makeBase()} disabled={saving} className="btn-primary-sm shrink-0 max-sm:w-full max-sm:justify-center">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Make it our base
              </button>
            )}
          </section>
        </Reveal>
      )}

      <Reveal delay={0.15} y={10}>
        <section aria-label={`Places in ${place}`} className="space-y-3.5">
          <h3 className="font-display text-xl font-medium tracking-[-0.015em]">Places in {place}</h3>
          <Pills label="Kinds of places" items={tabs.map((t) => ({ key: t.key, label: t.label }))} active={current.key} onPick={(key) => { setTab(key); setShown(STEP); }} />

          {guest ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-ink-soft">Create a free account to see real places here.</p>
              <button type="button" onClick={() => openGate("see places in this area")} className={cn(controlSecondary, "mt-3 h-10 px-5")}>Save my trip</button>
            </div>
          ) : !found || found.status === "loading" ? (
            <div aria-busy="true" aria-label="Finding places" className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[4/5] skeleton rounded-3xl" />)}
            </div>
          ) : found.status === "error" ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-ink-soft">Couldn’t look up places just now.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={cn(controlSecondary, "mt-3 h-10 px-5")}>Try again</button>
            </div>
          ) : visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">Nothing found for that here. Try another kind of place.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 @max-[34rem]:grid-cols-1 max-sm:grid-cols-1">
                {visible.map((p) => (
                  <div key={p.providerId}>
                    <PlaceCardView place={p} tripId={tripId} onOpenPlace={(card) => ctx?.openPanel({ kind: "place", placeId: card.providerId, name: card.name })} />
                  </div>
                ))}
              </div>
              {left > 0 && (
                <div className="flex justify-center">
                  <button type="button" onClick={() => setShown((n) => n + STEP)} className={cn(controlSecondary, "h-11 px-6")}>Show {Math.min(STEP, left)} more</button>
                </div>
              )}
            </>
          )}
        </section>
      </Reveal>

      {panel.onAsk && (
        <Reveal delay={0.2} y={10}>
          <section aria-label="Ask Roam" className="space-y-2.5">
            <h3 className="eyebrow">Ask Roam</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASKS[panel.optionKind](item.name).map(([label, prompt]) => (
                <button key={label} type="button" onClick={() => ask(prompt)} className={cn(controlSecondary, "h-11 justify-between px-4")}>
                  {label} <ArrowRight className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {panel.estimated && <p className={cn(typeScale.meta, "text-center")}>Estimated from general knowledge, not backed by a current source.</p>}
    </div>
  );
}
