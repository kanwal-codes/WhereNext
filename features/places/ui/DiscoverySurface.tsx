"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BedDouble, Loader2, Scale, Search, Sparkles } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { PlaceCard } from "@/components/PlaceCard";
import { EventCard, EventDialog, type NearbyEvent } from "@/components/EventCard";
import { SkeletonCards } from "@/components/Skeleton";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { CATEGORIES, CATEGORY_BY_KEY, coarseKind, type DiscoverCategory } from "./discoverTaxonomy";
import { cn } from "@/lib/utils";

const MAX_COMPARE = 4;
const PAGE = 6;

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
  : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

type StayItem = { hotelId: string; name: string; thumbnail: string | null; nightlyAmount: number; currency: string; stars: number | null; rating: number | null };
type Item =
  | { kind: "place"; place: Place }
  | { kind: "event"; event: NearbyEvent }
  | { kind: "stay"; stay: StayItem };
type Band = { key: string | null; label: string; items: Item[] };

const idOf = (item: Item) => (item.kind === "place" ? item.place.providerId : item.kind === "event" ? item.event.url : item.stay.hotelId);
const starBand = (stars: number | null) => (!stars ? 0 : stars >= 5 ? 4 : stars >= 4 ? 3 : stars >= 3 ? 2 : 1);
const toStayItem = (o: Record<string, unknown>): StayItem => ({
  hotelId: String(o.hotelId ?? ""),
  name: String(o.name ?? "Stay"),
  thumbnail: typeof o.thumbnail === "string" ? o.thumbnail : null,
  nightlyAmount: Number(o.nightlyAmount) || 0,
  currency: String(o.currency ?? ""),
  stars: typeof o.stars === "number" ? o.stars : null,
  rating: typeof o.rating === "number" ? o.rating : null,
});

export function DiscoverySurface({ tripId, initialSaved }: { tripId: string; initialSaved?: Array<Record<string, unknown>> }) {
  const { data } = useTripData();
  const destination = data?.trip.destination?.trim() ?? "";
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const interestsKey = [...asList(prefs.interests), ...asList(prefs.likes)].join(",").toLowerCase();
  const interests = useMemo(
    () => Array.from(new Set(interestsKey.split(",").filter(Boolean))).slice(0, 4),
    [interestsKey],
  );

  /** Anchor a free-text query to the trip's destination unless it already names a place. */
  const scope = useCallback(
    (q: string) => {
      const clean = q.trim();
      if (!destination) return clean;
      const head = destination.toLowerCase().split(",")[0].trim();
      return clean.includes(",") || clean.toLowerCase().includes(head) ? clean : `${clean} in ${destination}`;
    },
    [destination],
  );

  // --- saved shortlist (its own tab) ----------------------------------
  const seedSaved = (initialSaved ?? []).map((item) => (item.places ?? item) as unknown as Place).filter((p) => p?.providerId);
  const [saved, setSaved] = useState<Place[]>(seedSaved);
  const refreshSaved = useCallback(() => {
    fetch(`/api/trips/${tripId}/places`)
      .then((r) => r.json())
      .then((body) => setSaved((body.places ?? []).map((item: { places?: Place }) => item.places ?? item)))
      .catch(() => undefined);
  }, [tripId]);
  useEffect(() => {
    refreshSaved();
    return subscribeWorkspaceChanges(refreshSaved);
  }, [refreshSaved]);

  // --- filter + feed state ------------------------------------------
  const [view, setView] = useState<"results" | "saved">("results");
  const [catKey, setCatKey] = useState<string | null>(null); // null = "All"
  const [subs, setSubs] = useState<string[]>([]);
  const [flat, setFlat] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);

  const [bands, setBands] = useState<Band[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [openEvent, setOpenEvent] = useState<NearbyEvent | null>(null);
  const reqId = useRef(0);

  const fetchPlaces = useCallback(
    async (q: string): Promise<Place[]> => {
      const r = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(scope(q))}`);
      const body = await r.json().catch(() => ({}));
      return r.ok ? (body.places ?? []) : [];
    },
    [tripId, scope],
  );
  const fetchEvents = useCallback(
    async (q: string): Promise<NearbyEvent[]> => {
      if (!destination) return [];
      const qs = new URLSearchParams({ location: destination });
      if (q) qs.set("query", q);
      const r = await fetch(`/api/trips/${tripId}/events?${qs}`);
      const body = await r.json().catch(() => ({}));
      return r.ok ? (body.events ?? []) : [];
    },
    [tripId, destination],
  );
  const fetchStays = useCallback(async (): Promise<StayItem[]> => {
    if (!destination) return [];
    const r = await fetch(`/api/trips/${tripId}/stays`);
    const body = await r.json().catch(() => ({}));
    return r.ok ? ((body.options ?? []) as Array<Record<string, unknown>>).map(toStayItem).filter((s) => s.hotelId) : [];
  }, [tripId, destination]);

  const loadAll = useCallback(async () => {
    const mine = ++reqId.current;
    setLoading(true);
    setMessage("");
    const [forYou, sights, eat, ev, st] = await Promise.allSettled([
      fetchPlaces(interests.length ? interests.join(", ") : "highly rated things to do"),
      fetchPlaces("top sights and landmarks"),
      fetchPlaces("well-reviewed restaurants and cafes"),
      fetchEvents(""),
      fetchStays(),
    ]);
    if (mine !== reqId.current) return;
    const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value : []);
    const next: Band[] = [
      { key: "sights", label: "Top sights", items: ok(sights).slice(0, 6).map((p) => ({ kind: "place", place: p }) as Item) },
      {
        key: null,
        label: interests.length ? `Because you like ${interests.slice(0, 2).join(" & ")}` : "Highly rated right now",
        items: ok(forYou).slice(0, 6).map((p) => ({ kind: "place", place: p }) as Item),
      },
      { key: "eat", label: "Where to eat", items: ok(eat).slice(0, 6).map((p) => ({ kind: "place", place: p }) as Item) },
      { key: "events", label: "On while you’re there", items: ok(ev).slice(0, 6).map((e) => ({ kind: "event", event: e }) as Item) },
      { key: "stays", label: "Places to stay", items: ok(st).slice(0, 4).map((s) => ({ kind: "stay", stay: s }) as Item) },
    ].filter((b) => b.items.length);
    setBands(next);
    setLoading(false);
    setMessage(next.length ? "" : "The providers returned nothing just now. Try a search or a category.");
  }, [fetchPlaces, fetchEvents, fetchStays, interests]);

  const loadCategory = useCallback(
    async (cat: DiscoverCategory, chosen: string[]) => {
      const mine = ++reqId.current;
      setLoading(true);
      setMessage("");
      setVisible(PAGE);
      const subQ = (label: string) => cat.subs.find((s) => s.label === label)?.q ?? label;
      let next: Item[] = [];
      if (cat.kind === "place") {
        const queries = chosen.length ? chosen.map(subQ) : [cat.q];
        const lists = await Promise.all(queries.map(fetchPlaces));
        const map = new Map<string, Place>();
        for (const list of lists) for (const p of list) map.set(p.providerId, p);
        next = [...map.values()].map((p) => ({ kind: "place", place: p }));
      } else if (cat.kind === "event") {
        const events = await fetchEvents(chosen.map(subQ).join(" "));
        next = events.map((e) => ({ kind: "event", event: e }));
      } else {
        let list = await fetchStays();
        if (chosen.length) {
          const wanted = new Set(chosen.map((l) => Number(subQ(l))));
          list = list.filter((s) => wanted.has(starBand(s.stars)));
        }
        next = list.map((s) => ({ kind: "stay", stay: s }));
      }
      if (mine !== reqId.current) return;
      setItems(next);
      setLoading(false);
      setMessage(next.length ? "" : `Nothing came back for ${cat.label.toLowerCase()}${chosen.length ? " with those filters" : ""}.`);
    },
    [fetchPlaces, fetchEvents, fetchStays],
  );

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setSearchMode(true);
      setCatKey(null);
      setSubs([]);
      setFlat(false);
      setLoading(true);
      setMessage("");
      setVisible(PAGE);
      const mine = ++reqId.current;
      const places = await fetchPlaces(q);
      if (mine !== reqId.current) return;
      setItems(places.map((p) => ({ kind: "place", place: p })));
      setLoading(false);
      setMessage(places.length ? `“${q}” · ${places.length} near ${destination || "your destination"}` : "Nothing came back — try different words.");
    },
    [fetchPlaces, destination],
  );

  // Drive the feed from the active filter.
  useEffect(() => {
    if (view !== "results" || searchMode) return;
    if (!destination) {
      setLoading(false);
      return;
    }
    if (catKey === null) {
      void loadAll();
      return;
    }
    const cat = CATEGORY_BY_KEY.get(catKey);
    if (cat) void loadCategory(cat, subs);
  }, [view, searchMode, destination, catKey, subs, loadAll, loadCategory]);

  function pickCategory(key: string | null) {
    setSearchMode(false);
    setQuery("");
    setFlat(false);
    setSubs([]);
    setCatKey(key);
  }
  function toggleSub(label: string) {
    setSubs((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]));
  }
  function toggleCompare(place: Place) {
    if (compareIds.includes(place.providerId)) setCompareIds((ids) => ids.filter((id) => id !== place.providerId));
    else if (compareIds.length < MAX_COMPARE) setCompareIds((ids) => [...ids, place.providerId]);
    else notifyToast(`Compare up to ${MAX_COMPARE} at a time.`, "info");
  }

  const activeCat = catKey ? CATEGORY_BY_KEY.get(catKey) ?? null : null;
  const gridView = view === "saved" || searchMode || catKey !== null;
  const savedItems: Item[] = saved.map((p) => ({ kind: "place", place: p }));
  const gridItems = view === "saved" ? savedItems : items;
  const flatItems = useMemo(() => {
    const seen = new Set<string>();
    return (bands ?? []).flatMap((b) => b.items).filter((it) => (seen.has(idOf(it)) ? false : (seen.add(idOf(it)), true)));
  }, [bands]);

  const renderItem = (item: Item, mixed: boolean) => {
    if (item.kind === "place") {
      return (
        <StaggerItem key={`p:${item.place.providerId}`}>
          <PlaceCard
            tripId={tripId}
            place={item.place}
            inCompare={compareIds.includes(item.place.providerId)}
            onCompare={toggleCompare}
            kindLabel={mixed ? coarseKind(item.place.category) : undefined}
          />
        </StaggerItem>
      );
    }
    if (item.kind === "event") {
      return (
        <StaggerItem key={`e:${item.event.url}`}>
          <EventCard event={item.event} onOpen={() => setOpenEvent(item.event)} />
        </StaggerItem>
      );
    }
    return (
      <StaggerItem key={`s:${item.stay.hotelId}`}>
        <StayMiniCard tripId={tripId} stay={item.stay} />
      </StaggerItem>
    );
  };

  const grid = "grid auto-rows-fr items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
        className="flex items-center gap-2 rounded-2xl border border-input bg-card px-3 py-2 shadow-soft focus-within:ring-2 focus-within:ring-ring/25"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={destination ? `Search ${destination} — “rooftop bars”, “ramen”, “street art”` : "Search places for this trip"}
          aria-label="Search places"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {searchMode && (
          <button type="button" onClick={() => { setQuery(""); setSearchMode(false); setCatKey(null); }} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
        <button type="submit" disabled={loading || !query.trim()} className="btn-primary-sm shrink-0">
          {loading && searchMode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
        </button>
      </form>

      {/* Tier 1 — Discover / Saved toggle + broad categories */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border p-0.5 text-xs">
          {(["results", "saved"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn("rounded-full px-3 py-1 font-medium transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-ink-soft")}
            >
              {v === "saved" ? `Saved (${saved.length})` : "Discover"}
            </button>
          ))}
        </div>

        {view === "results" && (
          <>
            <button
              type="button"
              onClick={() => pickCategory(null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                !searchMode && catKey === null ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft hover:bg-accent",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> All
            </button>
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const on = !searchMode && catKey === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pickCategory(c.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft hover:bg-accent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {c.label}
                </button>
              );
            })}
          </>
        )}

        {compareIds.length >= 2 && (
          <motion.a
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            href={`/trips/${tripId}/compare?ids=${encodeURIComponent(compareIds.join(","))}`}
            className="btn-primary-sm ml-auto"
          >
            <Scale className="h-3.5 w-3.5" /> Compare {compareIds.length}
          </motion.a>
        )}
      </div>

      {/* Tier 2 — sub-types for the active category */}
      <AnimatePresence initial={false}>
        {view === "results" && activeCat && activeCat.subs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap gap-1.5">
              {activeCat.subs.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggleSub(s.label)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    subs.includes(s.label) ? "border-coral/50 bg-coral-soft text-coral" : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
              {subs.length > 0 && (
                <button type="button" onClick={() => setSubs([])} className="rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}

      {/* Feed */}
      {loading && gridItems.length === 0 && (bands === null || gridView) ? (
        <SkeletonCards count={6} className="mt-5" />
      ) : gridView ? (
        gridItems.length > 0 ? (
          <>
            <Stagger className={cn(grid, "mt-5")}>{gridItems.slice(0, visible).map((it) => renderItem(it, false))}</Stagger>
            {view === "results" && visible < gridItems.length && (
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="btn-secondary mt-5 w-full">
                Show more ({gridItems.length - visible} left)
              </button>
            )}
          </>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            {view === "saved"
              ? "Nothing shortlisted yet. Use Add to trip on any card, or ask the assistant for ideas."
              : "Nothing here right now — try a different filter or search."}
          </p>
        )
      ) : (
        // "All" digest
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">A mix for {destination || "this trip"}</p>
            {bands && bands.length > 0 && (
              <button type="button" onClick={() => setFlat((f) => !f)} className="text-xs font-medium text-primary hover:underline">
                {flat ? "Show bands" : "Just show everything"}
              </button>
            )}
          </div>

          {loading && !bands ? (
            <SkeletonCards count={6} className="mt-4" />
          ) : !bands || bands.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {destination ? "The providers returned nothing just now. Try a search or a category." : "Set a destination for this trip to see ideas here."}
            </p>
          ) : flat ? (
            <Stagger className={cn(grid, "mt-4")}>{flatItems.map((it) => renderItem(it, true))}</Stagger>
          ) : (
            <div className="mt-4 space-y-9">
              {(bands ?? []).map((band) => (
                <section key={band.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg">{band.label}</h3>
                    {band.key && (
                      <button type="button" onClick={() => pickCategory(band.key)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                        See all &rarr;
                      </button>
                    )}
                  </div>
                  <Stagger className={cn(grid, "mt-3")}>{band.items.map((it) => renderItem(it, true))}</Stagger>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>{openEvent && <EventDialog event={openEvent} onClose={() => setOpenEvent(null)} />}</AnimatePresence>
    </div>
  );
}

function StayMiniCard({ tripId, stay }: { tripId: string; stay: StayItem }) {
  return (
    <a
      href={`/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift"
    >
      {stay.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
        <img src={stay.thumbnail} alt={stay.name} loading="lazy" width={320} height={160} className="h-36 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="grid h-36 w-full place-items-center bg-muted text-muted-foreground">
          <BedDouble className="h-6 w-6 opacity-40" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-coral/30 bg-background/92 px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] text-coral uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-coral" /> Stay
        </span>
        <h3 className="truncate font-display text-base leading-tight">{stay.name}</h3>
        {(stay.stars || stay.rating) && (
          <p className="text-xs text-muted-foreground">
            {stay.stars ? `${stay.stars}★` : ""}
            {stay.stars && stay.rating ? " · " : ""}
            {stay.rating ? `${stay.rating}/10` : ""}
          </p>
        )}
        <p className="mt-auto pt-1">
          <span className="font-display text-base tabular-nums">{Math.round(stay.nightlyAmount)} {stay.currency}</span>
          <span className="text-xs text-muted-foreground"> / night</span>
        </p>
      </div>
    </a>
  );
}
