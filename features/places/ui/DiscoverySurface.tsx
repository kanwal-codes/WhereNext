"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BedDouble } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { useInfiniteReveal } from "@/lib/use-infinite-reveal";
import { PlaceCard } from "@/components/PlaceCard";
import { rankPlaces, type RankAnchor } from "@/lib/application/rank-places";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { SkeletonCards } from "@/components/Skeleton";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { CATEGORIES, CATEGORY_BY_KEY, type DiscoverCategory } from "./discoverTaxonomy";
import { cn } from "@/lib/utils";

const PAGE = 6;

/**
 * Raw category results, cached per session so tabbing Eat → Nightlife → Eat
 * doesn't re-hit the API each time. Keyed on trip + category + sub-filters; the
 * *ranking* is re-applied on every read, so a fresh shortlist still reorders.
 */
const categoryRawCache = new Map<string, Place[] | NearbyEvent[] | StayItem[]>();

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
  : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

type StayItem = { hotelId: string; name: string; thumbnail: string | null; nightlyAmount: number; currency: string; stars: number | null; rating: number | null };
type Item =
  | { kind: "place"; place: Place; why?: string | null }
  | { kind: "event"; event: NearbyEvent }
  | { kind: "stay"; stay: StayItem };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null);
const folded = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const inDestination = (place: Place, destination: string) => {
  const city = folded(destination.split(",")[0]?.trim() ?? destination);
  return !city || folded(place.address ?? "").includes(city);
};
// A "guided tours" text search matches loosely — Google mixes in famous landmarks that merely
// mention tours, not the tour operators themselves. Keep only actual tour/travel businesses.
const isTourOperator = (place: Place) =>
  place.category === "tour_agency" || place.category === "travel_agency" || /\btour(s)?\b/i.test(place.name);
type Band = { key: string | null; label: string; items: Item[] };

// Same URL + different date is a distinct showtime (recurring events often share one ticket
// page across slots) — include the date so dedup doesn't collapse them into a single listing.
const idOf = (item: Item) => (item.kind === "place" ? item.place.providerId : item.kind === "event" ? `${item.event.url}|${item.event.date ?? ""}` : item.stay.hotelId);
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

export function DiscoverTabs({ view, onChange, savedCount }: { view: "results" | "saved"; onChange: (v: "results" | "saved") => void; savedCount: number }) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full bg-muted p-1 text-sm">
        {(["results", "saved"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn("rounded-full px-5 py-2 font-medium transition-colors", view === v ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "saved" ? `Saved (${savedCount})` : "Discover"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DiscoverySurface({
  tripId,
  initialSaved,
  initialQuery,
  view,
  onViewChange,
  onSavedCountChange,
}: {
  tripId: string;
  initialSaved?: Array<Record<string, unknown>>;
  initialQuery?: string;
  view: "results" | "saved";
  onViewChange: (v: "results" | "saved") => void;
  onSavedCountChange?: (n: number) => void;
}) {
  const { data } = useTripData();
  const panelCtx = useTripPanelMaybe();
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
    // The server already seeds `saved`; only fetch on mount when it didn't (preview route).
    if (!initialSaved) refreshSaved();
    return subscribeWorkspaceChanges(refreshSaved);
  }, [refreshSaved, initialSaved]);
  useEffect(() => {
    onSavedCountChange?.(saved.length);
  }, [saved.length, onSavedCountChange]);

  // --- filter + feed state ------------------------------------------
  const [catKey, setCatKey] = useState<string | null>(null); // null = "All"
  const [subs, setSubs] = useState<string[]>([]);
  const [flat, setFlat] = useState(false);
  const [searchLabel, setSearchLabel] = useState(""); // what the AI search resolved to, for the "Clear" chip
  const [searchMode, setSearchMode] = useState(false);

  const [bands, setBands] = useState<Band[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const reqId = useRef(0);
  const eventsPage = useRef(0);
  const eventsLoading = useRef(false);
  const eventsHasMore = useRef(true);
  const eventsSentinel = useRef<HTMLDivElement | null>(null);

  const fetchPlaces = useCallback(
    async (q: string): Promise<Place[]> => {
      const r = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(scope(q))}`);
      const body = await r.json().catch(() => ({}));
      return r.ok ? (body.places ?? []) : [];
    },
    [tripId, scope],
  );
  const fetchEvents = useCallback(
    async (q: string, page = 0): Promise<NearbyEvent[]> => {
      if (!destination) return [];
      const qs = new URLSearchParams({ location: destination });
      if (q) qs.set("query", q);
      if (page > 0) qs.set("page", String(page));
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

  // Personalised ordering for every place list — same ranker the assistant's
  // RETRIEVE uses, so Discover and chat stay coherent.
  const dislikesKey = asList(prefs.dislikes).join(",").toLowerCase();
  const savedKey = saved.map((p) => p.providerId).sort().join(",");
  const itinKey = (data?.itinerary ?? [])
    .map((i) => (i.metadata as { latitude?: number; longitude?: number } | null) ?? {})
    .map((m) => `${num(m.latitude) ?? ""},${num(m.longitude) ?? ""}`)
    .join("|");
  const rankCtx = useMemo(() => {
    const pts = itinKey.split("|").map((s) => s.split(",")).filter((xy) => xy[0] && xy[1]).map(([a, b]) => ({ latitude: Number(a), longitude: Number(b) }));
    const anchor: RankAnchor | null = pts.length
      ? { latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length, longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length }
      : null;
    return {
      interests: asList(prefs.interests),
      likes: asList(prefs.likes),
      dislikes: dislikesKey.split(",").filter(Boolean),
      savedIds: savedKey.split(",").filter(Boolean),
      anchor,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitive keys stand in for the object deps
  }, [interestsKey, dislikesKey, savedKey, itinKey]);
  const rankToItems = useCallback(
    (places: Place[]): Item[] => rankPlaces(places, rankCtx).map((r) => ({ kind: "place", place: r.place, why: r.why })),
    [rankCtx],
  );

  const loadAll = useCallback(async () => {
    const mine = ++reqId.current;
    eventsPage.current = 0;
    eventsHasMore.current = true;
    // Not keyed on saved places: the digest's *membership* doesn't change when you
    // shortlist something (only its ordering would), so tabbing away and back stays
    // instant instead of re-hitting five providers. 30-min TTL keeps events fresh.
    // dislikesKey is part of the key, not just the ranking, so a newly-stated dislike takes
    // effect immediately instead of waiting out a cached digest that was built before it existed.
    const cacheKey = `discover:${tripId}:${destination}:${interestsKey}:${dislikesKey}`;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const hit = JSON.parse(raw) as { t: number; bands: Band[] };
        if (Date.now() - hit.t < 30 * 60_000) { setBands(hit.bands); setLoading(false); return; }
      }
    } catch { /* ignore */ }
    setLoading(true);
    setMessage("");
    const [forYou, sights, eat, tours, ev, st] = await Promise.allSettled([
      fetchPlaces(interests.length ? interests.join(", ") : "highly rated things to do"),
      fetchPlaces("top sights and landmarks"),
      fetchPlaces("well-reviewed restaurants and cafes"),
      fetchPlaces("guided tours"),
      fetchEvents(""),
      fetchStays(),
    ]);
    if (mine !== reqId.current) return;
    const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value : []);
    const next: Band[] = [
      { key: "sights", label: "Top sights", items: rankToItems(ok(sights)) },
      {
        key: null,
        label: interests.length ? `Because you like ${interests.slice(0, 2).join(" & ")}` : "Highly rated right now",
        items: rankToItems(ok(forYou)),
      },
      { key: "eat", label: "Where to eat", items: rankToItems(ok(eat).filter((place) => inDestination(place, destination))) },
      // Real, dynamic tour operators from Google Places — not GetYourGuide's own catalog (no API
      // access there). Opening one still surfaces a "Book on GetYourGuide" link once configured,
      // via PlaceDetailView's GetYourGuideCard.
      { key: "activities", label: "Tours & activities", items: rankToItems(ok(tours).filter(isTourOperator)) },
      { key: "events", label: "On while you’re there", items: ok(ev).map((e) => ({ kind: "event", event: e }) as Item) },
      { key: "stays", label: "Places to stay", items: ok(st).slice(0, 4).map((s) => ({ kind: "stay", stay: s }) as Item) },
    ].filter((b) => b.items.length);
    setBands(next);
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), bands: next })); } catch { /* ignore */ }
    setLoading(false);
    setMessage(next.length ? "" : "Nothing came back just now. Try a search or a different category.");
  }, [fetchPlaces, fetchEvents, fetchStays, interests, interestsKey, dislikesKey, destination, tripId, rankToItems]);

  const loadMoreEvents = useCallback(async () => {
    if (eventsLoading.current || !eventsHasMore.current || !destination) return;
    eventsLoading.current = true;
    const nextPage = eventsPage.current + 1;
    try {
      const next = await fetchEvents("", nextPage);
      if (next.length === 0) {
        eventsHasMore.current = false;
        return;
      }
      eventsPage.current = nextPage;
      setBands((current) => current?.map((band) => {
        if (band.key !== "events") return band;
        const existing = new Set(band.items.map((item) => item.kind === "event" ? `${item.event.url}|${item.event.date ?? ""}` : ""));
        const additions = next.filter((event) => !existing.has(`${event.url}|${event.date ?? ""}`)).map((event) => ({ kind: "event", event }) as Item);
        return additions.length ? { ...band, items: [...band.items, ...additions] } : band;
      }) ?? current);
    } finally {
      eventsLoading.current = false;
    }
  }, [destination, fetchEvents]);

  useEffect(() => {
    const sentinel = eventsSentinel.current;
    if (!sentinel || view !== "results" || flat || searchMode || catKey !== null || !bands?.some((band) => band.key === "events")) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreEvents();
    }, { rootMargin: "900px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [bands, view, flat, searchMode, catKey, loadMoreEvents]);

  const loadCategory = useCallback(
    async (cat: DiscoverCategory, chosen: string[]) => {
      const mine = ++reqId.current;
      setLoading(true);
      setMessage("");
      const subQ = (label: string) => cat.subs.find((s) => s.label === label)?.q ?? label;
      const cacheKey = `${tripId}:${cat.key}:${cat.kind === "stay" ? "" : [...chosen].sort().join("|")}`;
      const cachedRaw = categoryRawCache.get(cacheKey);
      let next: Item[] = [];
      if (cat.kind === "place") {
        let places = cachedRaw as Place[] | undefined;
        if (!places) {
          const queries = chosen.length ? chosen.map(subQ) : [cat.q];
          const lists = await Promise.all(queries.map(fetchPlaces));
          const map = new Map<string, Place>();
          for (const list of lists) for (const p of list) map.set(p.providerId, p);
          places = [...map.values()];
          categoryRawCache.set(cacheKey, places);
        }
        next = rankToItems(places);
      } else if (cat.kind === "event") {
        let events = cachedRaw as NearbyEvent[] | undefined;
        if (!events) {
          events = await fetchEvents(chosen.map(subQ).join(" "));
          categoryRawCache.set(cacheKey, events);
        }
        next = events.map((e) => ({ kind: "event", event: e }));
      } else {
        let all = cachedRaw as StayItem[] | undefined;
        if (!all) {
          all = await fetchStays();
          categoryRawCache.set(cacheKey, all);
        }
        const wanted = chosen.length ? new Set(chosen.map((l) => Number(subQ(l)))) : null;
        const list = wanted ? all.filter((s) => wanted.has(starBand(s.stars))) : all;
        next = list.map((s) => ({ kind: "stay", stay: s }));
      }
      if (mine !== reqId.current) return;
      setItems(next);
      setLoading(false);
      setMessage(next.length ? "" : `Nothing came back for ${cat.label.toLowerCase()}${chosen.length ? " with those filters" : ""}.`);
    },
    [tripId, fetchPlaces, fetchEvents, fetchStays, rankToItems],
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
      const mine = ++reqId.current;
      const eventCategory = CATEGORY_BY_KEY.get("events");
      const eventIntent = eventCategory && q.toLowerCase().includes("concert");
      const places = eventIntent ? [] : await fetchPlaces(q);
      const events = eventIntent ? await fetchEvents(q) : [];
      if (mine !== reqId.current) return;
      setItems(eventIntent ? events.map((event) => ({ kind: "event", event }) as Item) : rankToItems(places));
      setLoading(false);
      const count = eventIntent ? events.length : places.length;
      setMessage(count ? `“${q}” · ${count} near ${destination || "your destination"}` : "Nothing came back — try different words.");
    },
    [fetchPlaces, fetchEvents, destination, rankToItems],
  );

  // Arriving from a "See more" elsewhere (a place's nearby recommendations) — run that
  // lane's own query here instead of landing on the generic mixed feed.
  const ranInitialQuery = useRef(false);
  useEffect(() => {
    if (!initialQuery || ranInitialQuery.current) return;
    ranInitialQuery.current = true;
    void runSearch(initialQuery);
    setSearchLabel(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the query the page mounted with
  }, [initialQuery]);

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
    setSearchLabel("");
    setFlat(false);
    setSubs([]);
    setCatKey(key);
  }

  const CAT_LABEL: Record<string, string> = { outdoors: "Nature & Outdoors", events: "Culture & Events" };
  function applyDirective(d: AiSearchDirective, raw: string) {
    const core = (d.freeText ?? raw).trim();
    // A specific ask ("rooftop bars") beats a coarse bucket ("nightlife").
    const genericAsk = !d.freeText || d.freeText.length < 4;
    const cat = (d.categories ?? []).map((k) => k.toLowerCase()).find((k) => CATEGORY_BY_KEY.has(k));
    if (cat && genericAsk) {
      pickCategory(cat);
      if (d.subChips?.length) setSubs(d.subChips);
      setSearchLabel(CAT_LABEL[cat] ?? cat);
      return;
    }
    void runSearch(d.location ? `${core} near ${d.location}` : core);
    setSearchLabel(d.location ? `${core} · near ${d.location}` : core);
  }
  function toggleSub(label: string) {
    setSubs((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]));
  }
  const activeCat = catKey ? CATEGORY_BY_KEY.get(catKey) ?? null : null;
  const gridView = view === "saved" || searchMode || catKey !== null;
  const savedItems: Item[] = saved.map((p) => ({ kind: "place", place: p }));
  const gridItems = view === "saved" ? savedItems : items;
  // Reset the reveal only when the list itself changes — not when `saved` re-fetches under us.
  const { visible, sentinel, more } = useInfiniteReveal(gridItems.length, PAGE, view === "saved" ? `saved:${saved.length}` : items);
  const flatItems = useMemo(() => {
    const seen = new Set<string>();
    return (bands ?? []).flatMap((b) => b.items).filter((it) => (seen.has(idOf(it)) ? false : (seen.add(idOf(it)), true)));
  }, [bands]);

  const renderItem = (item: Item) => {
    if (item.kind === "place") {
      return (
        <StaggerItem key={`p:${item.place.providerId}`}>
          <PlaceCard tripId={tripId} place={item.place} why={item.why ?? undefined} />
        </StaggerItem>
      );
    }
    if (item.kind === "event") {
      return (
        <StaggerItem key={`e:${item.event.url}|${item.event.date ?? ""}`}>
          <EventCard tripId={tripId} event={item.event} />
        </StaggerItem>
      );
    }
    return (
      <StaggerItem key={`s:${item.stay.hotelId}`}>
        <StayMiniCard tripId={tripId} stay={item.stay} />
      </StaggerItem>
    );
  };

  const grid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div>
      <AiSearchBar
        tripId={tripId}
        scope="discover"
        placeholder={destination ? `Ask — “rooftop bars near old Montreal”, “kid-friendly museums”, “ramen”` : "Ask for places for this trip"}
        onDirective={applyDirective}
        className="w-full max-w-3xl"
      />
      {(searchMode || catKey !== null) && searchLabel && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Showing: <span className="font-medium text-foreground">{searchLabel}</span></span>
          <button type="button" onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }} className="shrink-0 hover:text-foreground">
            Clear
          </button>
        </p>
      )}

      {/* Tier 1 — Compare + broad categories (Discover/Saved lives in the page header now). One row, scrolls sideways. */}
      {view === "results" && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto scrollbar-slim pb-1">
            {panelCtx && (
              <button
                type="button"
                onClick={() => panelCtx.setCompareMode(!panelCtx.compareMode)}
                className={cn(
                  "shrink-0 rounded-full border border-foreground bg-background px-3.5 py-1.5 text-xs font-medium text-foreground shadow-soft transition-[background-color,box-shadow] hover:bg-accent",
                  panelCtx.compareMode && "ring-2 ring-coral ring-offset-2 ring-offset-background",
                )}
              >
                {panelCtx.compareMode ? `Comparing · ${panelCtx.compareList.length}` : "Compare"}
              </button>
            )}
            <button
              type="button"
              onClick={() => pickCategory(null)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                !searchMode && catKey === null ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft hover:bg-accent",
              )}
            >
              All
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
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-background text-ink-soft hover:bg-accent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {c.label}
                </button>
              );
            })}
        </div>
      )}
      {panelCtx?.compareMode && panelCtx.compareList.length >= 2 && <button type="button" onClick={panelCtx.openCompare} className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">Compare selected</button>}

      {/* Tier 2 — sub-types for the active category. One row, scrolls sideways. */}
      <AnimatePresence initial={false}>
        {view === "results" && activeCat && activeCat.subs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-slim pb-1">
              {activeCat.subs.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggleSub(s.label)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    subs.includes(s.label) ? "border-coral/50 bg-coral-soft text-coral" : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
              {subs.length > 0 && (
                <button type="button" onClick={() => setSubs([])} className="shrink-0 rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
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
        <SkeletonCards count={6} className={cn("mt-5", !gridView && "grid-cols-2 sm:grid-cols-3")} />
      ) : gridView ? (
        gridItems.length > 0 ? (
          <>
            <Stagger className={cn(grid, "mt-5")}>{gridItems.slice(0, visible).map((it) => renderItem(it))}</Stagger>
            {more && <div ref={sentinel} aria-hidden className="h-8" />}
          </>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            {view === "saved"
              ? "Nothing shortlisted yet. Use Add to trip on any card, or ask Roam for ideas."
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
            <SkeletonCards count={6} className="mt-4 grid-cols-2 sm:grid-cols-3" />
          ) : !bands || bands.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {destination ? "Nothing came back just now. Try a search or a different category." : "Set a destination for this trip to see ideas here."}
            </p>
          ) : flat ? (
            <Stagger className={cn(grid, "mt-4")}>{flatItems.map((it) => renderItem(it))}</Stagger>
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
                  {/* Two rows of three per band; the rest lives behind "See all". */}
                  <Stagger className={cn("mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3")}>
                    {band.items.slice(0, 6).map((it) => renderItem(it))}
                  </Stagger>
                  {band.key && band.items.length > 6 && (
                    <button
                      type="button"
                      onClick={() => pickCategory(band.key)}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft transition-colors hover:bg-accent"
                    >
                      See all {band.label.toLowerCase()} &rarr;
                    </button>
                  )}
                  {band.key === "events" && <div ref={eventsSentinel} aria-hidden className="h-8" />}
                </section>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function StayMiniCard({ tripId, stay }: { tripId: string; stay: StayItem }) {
  const panelCtx = useTripPanelMaybe();
  const href = `/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}`;
  const entry: CompareEntry = { id: stay.hotelId, kind: "stay", name: stay.name, href, image: stay.thumbnail ?? undefined, attrs: { price: `${Math.round(stay.nightlyAmount)} ${stay.currency}/night`, priceValue: stay.nightlyAmount, rating: stay.rating != null ? `${stay.rating}/10` : undefined, ratingValue: stay.rating ?? undefined, detail: "Stay" } };
  return (
    <a
      href={href}
      onClick={(e) => {
        if (!panelCtx || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        if (panelCtx.compareMode) panelCtx.compareToggle(entry);
        else panelCtx.openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name });
      }}
      className="group flex h-[19rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift"
    >
      {stay.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
        <img src={stay.thumbnail} alt={stay.name} loading="lazy" width={320} height={160} className="h-40 w-full shrink-0 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="grid h-40 w-full shrink-0 place-items-center bg-muted text-muted-foreground">
          <BedDouble className="h-6 w-6 opacity-40" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
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
        {panelCtx?.compareMode && <p className="text-[11px] text-muted-foreground">{panelCtx.compareHas(stay.hotelId) ? "Selected" : "Click to compare"}</p>}
      </div>
    </a>
  );
}
