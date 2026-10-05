"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BedDouble, Compass } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { useTripData } from "@/components/TripDataProvider";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { PlaceCard } from "@/components/PlaceCard";
import { CardMedia, CompareMark, DetailsButton, EntityCard, MediaFallback, money } from "@/features/conversation/ui/blocks/ui";
import { rankPlaces, type RankAnchor } from "@/lib/application/rank-places";
import { usesMiles } from "@/lib/application/geo";
import { readStayDecision } from "@/packages/contracts/stay";
import { EventCard, type NearbyEvent } from "@/components/EventCard";
import { SkeletonCards } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { CATEGORIES, CATEGORY_BY_KEY, type DiscoverCategory } from "./discoverTaxonomy";
import { cn } from "@/lib/utils";
import { cachedGet } from "@/lib/client/cached-get";


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
    <SegmentedSwitch
      label="Discover view"
      value={view}
      onChange={onChange}
      options={[
        { key: "results", label: "Discover" },
        { key: "saved", label: `Saved (${savedCount})` },
      ]}
    />
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
  // Cancels the in-flight provider requests from whatever `loadAll`/`loadCategory` call this one
  // supersedes — `reqId` already discards a stale *result*, but without this the superseded
  // request keeps running server-side to completion regardless, burning provider quota and
  // backend load on every fast category switch or re-search.
  const abortRef = useRef<AbortController | null>(null);
  // The provider pages events one request at a time. Only an events category asks for the next page, and only when the reader presses the button.
  const eventPaging = useRef({ q: "", page: 0, more: false });
  const [eventsBusy, setEventsBusy] = useState(false);

  const fetchPlaces = useCallback(
    async (q: string, signal?: AbortSignal): Promise<Place[]> => {
      const r = await cachedGet(`/api/trips/${tripId}/places?query=${encodeURIComponent(scope(q))}`, { signal });
      const body = await r.json().catch(() => ({}));
      return r.ok ? (body.places ?? []) : [];
    },
    [tripId, scope],
  );
  const fetchEvents = useCallback(
    async (q: string, page = 0, signal?: AbortSignal): Promise<NearbyEvent[]> => {
      if (!destination) return [];
      const qs = new URLSearchParams({ location: destination });
      if (q) qs.set("query", q);
      if (page > 0) qs.set("page", String(page));
      const r = await cachedGet(`/api/trips/${tripId}/events?${qs}`, { signal });
      const body = await r.json().catch(() => ({}));
      return r.ok ? (body.events ?? []) : [];
    },
    [tripId, destination],
  );
  const fetchStays = useCallback(async (signal?: AbortSignal): Promise<StayItem[]> => {
    if (!destination) return [];
    const r = await cachedGet(`/api/trips/${tripId}/stays`, { signal });
    const body = await r.json().catch(() => ({}));
    return r.ok ? ((body.options ?? []) as Array<Record<string, unknown>>).map(toStayItem).filter((s) => s.hotelId) : [];
  }, [tripId, destination]);

  // Personalised ordering for every place list — same ranker the assistant's
  // RETRIEVE uses, so Discover and chat stay coherent.
  const dislikesKey = asList(prefs.dislikes).join(",").toLowerCase();
  const savedKey = saved.map((p) => p.providerId).sort().join(",");
  const rejectedKey = (data?.rejectedPlaceIds ?? []).slice().sort().join(",");
  const itinKey = (data?.itinerary ?? [])
    .map((i) => (i.metadata as { latitude?: number; longitude?: number } | null) ?? {})
    .map((m) => `${num(m.latitude) ?? ""},${num(m.longitude) ?? ""}`)
    .join("|");
  // Distinct from the `anchor` centroid below: only ever a real, confirmed hotel, so the
  // ranker's "why" label can honestly say "from your stay" (see rank-places.ts's stayAnchor doc).
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  const stayKey = lockedStay?.latitude != null && lockedStay?.longitude != null ? `${lockedStay.latitude},${lockedStay.longitude}` : "";
  const miles = usesMiles(prefs.country);
  const rankCtx = useMemo(() => {
    const pts = itinKey.split("|").map((s) => s.split(",")).filter((xy) => xy[0] && xy[1]).map(([a, b]) => ({ latitude: Number(a), longitude: Number(b) }));
    const anchor: RankAnchor | null = pts.length
      ? { latitude: pts.reduce((s, p) => s + p.latitude, 0) / pts.length, longitude: pts.reduce((s, p) => s + p.longitude, 0) / pts.length }
      : null;
    const [stayLat, stayLng] = stayKey.split(",");
    const stayAnchor: RankAnchor | null = stayKey ? { latitude: Number(stayLat), longitude: Number(stayLng) } : null;
    return {
      interests: asList(prefs.interests),
      likes: asList(prefs.likes),
      dislikes: dislikesKey.split(",").filter(Boolean),
      savedIds: savedKey.split(",").filter(Boolean),
      rejectedIds: rejectedKey.split(",").filter(Boolean),
      anchor,
      stayAnchor,
      miles,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitive keys stand in for the object deps
  }, [interestsKey, dislikesKey, savedKey, rejectedKey, itinKey, stayKey, miles]);
  const rankToItems = useCallback(
    (places: Place[]): Item[] => rankPlaces(places, rankCtx).map((r) => ({ kind: "place", place: r.place, why: r.why })),
    [rankCtx],
  );

  const loadAll = useCallback(async () => {
    const mine = ++reqId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
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
      fetchPlaces(interests.length ? interests.join(", ") : "highly rated things to do", controller.signal),
      fetchPlaces("top sights and landmarks", controller.signal),
      fetchPlaces("well-reviewed restaurants and cafes", controller.signal),
      fetchPlaces("guided tours", controller.signal),
      fetchEvents("", 0, controller.signal),
      fetchStays(controller.signal),
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
      { key: "stays", label: "Places to stay", items: ok(st).slice(0, 6).map((s) => ({ kind: "stay", stay: s }) as Item) },
    ].filter((b) => b.items.length);
    setBands(next);
    // Live-caught: every provider call can transiently return nothing at once (a rate limit, a
    // blip) — caching THAT for 30 minutes meant one bad load left the page stuck showing "Nothing
    // came back" with no way to recover short of waiting out the TTL, since a reload just replays
    // the cached empty digest without ever re-fetching. A genuinely empty destination is not a
    // real case these generic category queries ("top sights", "restaurants", ...) hit in
    // practice, so only a non-empty digest is worth caching — an empty one leaves the cache alone
    // and tries again fresh next visit.
    if (next.length > 0) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), bands: next })); } catch { /* ignore */ }
    }
    setLoading(false);
    setMessage(next.length ? "" : "Nothing came back just now. Try a search or a different category.");
  }, [fetchPlaces, fetchEvents, fetchStays, interests, interestsKey, dislikesKey, destination, tripId, rankToItems]);

  const loadCategory = useCallback(
    async (cat: DiscoverCategory, chosen: string[]) => {
      const mine = ++reqId.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setMessage("");
      try {
        const subQ = (label: string) => cat.subs.find((s) => s.label === label)?.q ?? label;
        const cacheKey = `${tripId}:${cat.key}:${cat.kind === "stay" ? "" : [...chosen].sort().join("|")}`;
        const cachedRaw = categoryRawCache.get(cacheKey);
        let next: Item[] = [];
        if (cat.kind === "place") {
          let places = cachedRaw as Place[] | undefined;
          if (!places) {
            const queries = chosen.length ? chosen.map(subQ) : [cat.q];
            const lists = await Promise.all(queries.map((q) => fetchPlaces(q, controller.signal)));
            const map = new Map<string, Place>();
            for (const list of lists) for (const p of list) map.set(p.providerId, p);
            places = [...map.values()];
            categoryRawCache.set(cacheKey, places);
          }
          next = rankToItems(places);
        } else if (cat.kind === "event") {
          let events = cachedRaw as NearbyEvent[] | undefined;
          const eventQuery = chosen.map(subQ).join(" ");
          if (!events) {
            events = await fetchEvents(eventQuery, 0, controller.signal);
            categoryRawCache.set(cacheKey, events);
          }
          eventPaging.current = { q: eventQuery, page: 0, more: events.length > 0 };
          next = events.map((e) => ({ kind: "event", event: e }));
        } else {
          let all = cachedRaw as StayItem[] | undefined;
          if (!all) {
            all = await fetchStays(controller.signal);
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
      } catch (error) {
        if (mine !== reqId.current) return; // superseded — the newer call owns loading/message state now
        if (error instanceof DOMException && error.name === "AbortError") return; // this call was the one cancelled
        setLoading(false);
        setMessage(`Nothing came back for ${cat.label.toLowerCase()}${chosen.length ? " with those filters" : ""}.`);
      }
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
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const eventCategory = CATEGORY_BY_KEY.get("events");
        const eventIntent = eventCategory && q.toLowerCase().includes("concert");
        const places = eventIntent ? [] : await fetchPlaces(q, controller.signal);
        const events = eventIntent ? await fetchEvents(q, 0, controller.signal) : [];
        if (mine !== reqId.current) return;
        setItems(eventIntent ? events.map((event) => ({ kind: "event", event }) as Item) : rankToItems(places));
        setLoading(false);
        const count = eventIntent ? events.length : places.length;
        setMessage(count ? `“${q}” · ${count} near ${destination || "your destination"}` : "Nothing came back — try different words.");
      } catch (error) {
        if (mine !== reqId.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoading(false);
        setMessage("Nothing came back — try different words.");
      }
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
  const gridMore = useShowMore(gridItems.length, view === "saved" ? `saved:${saved.length}` : items);
  const flatItems = useMemo(() => {
    const seen = new Set<string>();
    return (bands ?? []).flatMap((b) => b.items).filter((it) => (seen.has(idOf(it)) ? false : (seen.add(idOf(it)), true)));
  }, [bands]);
  // "Just show everything" is every band's items deduped into one list — same windowing the
  // grid view already gets, so asking to see more doesn't mount every card (150+, for a full
  // digest) synchronously in one pass.
  const flatMore = useShowMore(flatItems.length, flatItems);
  async function loadMoreEvents() {
    if (eventsBusy || !eventPaging.current.more) return;
    setEventsBusy(true);
    const { q, page } = eventPaging.current;
    try {
      const next = await fetchEvents(q, page + 1);
      eventPaging.current = { q, page: page + 1, more: next.length > 0 };
      setItems((current) => {
        const have = new Set(current.map(idOf));
        return [...current, ...next.map((event) => ({ kind: "event", event }) as Item).filter((it) => !have.has(idOf(it)))];
      });
    } finally {
      setEventsBusy(false);
    }
  }

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
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col">
      {(searchMode || catKey !== null) && searchLabel && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Showing: <span className="font-medium text-foreground">{searchLabel}</span></span>
          <button type="button" onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }} className="shrink-0 hover:text-foreground">
            Clear
          </button>
        </p>
      )}

      {/* Tier 1 — Compare + broad categories (Discover/Saved lives in the page header now). One row, scrolls sideways. */}
      {view === "results" && (!searchMode || panelCtx) && (
        <div className="mt-4 flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-slim px-1 py-1">
            {panelCtx && (
              <button
                type="button"
                onClick={() => {
                  panelCtx.setCompareMode(!panelCtx.compareMode);
                  panelCtx.compareClear();
                }}
                aria-pressed={panelCtx.compareMode}
                className="btn-chip shrink-0"
              >
                {panelCtx.compareMode ? `Comparing · ${panelCtx.compareList.length}` : "Compare"}
              </button>
            )}
            {/* The category chips narrow the digest, so they mean nothing beside a search's own results: the strip keeps only Compare until the search is cleared. */}
            <AnimatePresence initial={false}>
              {!searchMode && (
                <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }} className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => pickCategory(null)}
                    aria-pressed={!searchMode && catKey === null}
                    className="btn-chip shrink-0"
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
                        aria-pressed={on}
                        className="btn-chip shrink-0"
                      >
                        <Icon className="h-3.5 w-3.5" /> {c.label}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
        </div>
      )}
      {/* Tier 2 — sub-types for the active category. One row, scrolls sideways. */}
      <AnimatePresence initial={false}>
        {view === "results" && activeCat && activeCat.subs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-slim pb-1">
              {activeCat.subs.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggleSub(s.label)}
                  aria-pressed={subs.includes(s.label)}
                  className="btn-chip h-7 shrink-0 px-3"
                >
                  {s.label}
                </button>
              ))}
              {subs.length > 0 && (
                <button type="button" onClick={() => setSubs([])} className="shrink-0 rounded-full px-2 py-1 text-2xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}

      {/* Feed: each state (skeleton, grid, digest) crossfades into the next. */}
      <div className="relative">
        <SwapView id={loading && gridItems.length === 0 && (bands === null || gridView) ? "skeleton" : gridView ? "grid" : loading && !bands ? "digest-loading" : "digest"}>
      {loading && gridItems.length === 0 && (bands === null || gridView) ? (
        <SkeletonCards count={6} className={cn("mt-5", !gridView && "grid-cols-2 sm:grid-cols-3")} />
      ) : gridView ? (
        gridItems.length > 0 ? (
          <>
            <Stagger className={cn(grid, "mt-5")}>{gridItems.slice(0, gridMore.visible).map((it) => renderItem(it))}</Stagger>
            {/* Rows already in hand come first (no request); an events list that has run out of them asks the provider for its next page. */}
            {gridMore.remaining > 0 ? (
              <div className="mt-6"><ShowMoreButton next={gridMore.next} visible={gridMore.visible} total={gridItems.length} onClick={gridMore.showMore} noun="results" /></div>
            ) : view !== "saved" && activeCat?.kind === "event" && eventPaging.current.more ? (
              <div className="mt-6"><ShowMoreButton force busy={eventsBusy} next={0} visible={gridItems.length} total={gridItems.length} onClick={() => void loadMoreEvents()} noun="events" /></div>
            ) : null}
          </>
        ) : (
          <EmptyState icon={Compass} className="mt-8">
            {view === "saved"
              ? "Nothing shortlisted yet. Use Add to trip on any card, or ask Roam for ideas."
              : "Nothing here right now — try a different filter or search."}
          </EmptyState>
        )
      ) : (
        // "All" digest
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow min-w-0 truncate">A mix for {destination || "this trip"}</p>
            {bands && bands.length > 0 && (
              <button type="button" onClick={() => setFlat((f) => !f)} className="shrink-0 text-xs font-medium whitespace-nowrap text-primary hover:underline">
                {flat ? "Show bands" : "Just show everything"}
              </button>
            )}
          </div>

          {loading && !bands ? (
            <SkeletonCards count={6} className="mt-4 grid-cols-2 sm:grid-cols-3" />
          ) : !bands || bands.length === 0 ? (
            <EmptyState icon={Compass} className="mt-8">
              {destination ? "Nothing came back just now. Try a search or a different category." : "Set a destination for this trip to see ideas here."}
            </EmptyState>
          ) : flat ? (
            <>
              <Stagger className={cn(grid, "mt-4")}>{flatItems.slice(0, flatMore.visible).map((it) => renderItem(it))}</Stagger>
              <div className="mt-6"><ShowMoreButton next={flatMore.next} visible={flatMore.visible} total={flatItems.length} onClick={flatMore.showMore} noun="places" /></div>
            </>
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
                </section>
              ))}
            </div>
          )}
        </div>
      )}
        </SwapView>
      </div>

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). */}
      <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="discover"
        placeholder={destination ? `Ask — “rooftop bars near ${destination.split(",")[0].trim()}”, “kid-friendly museums”, “ramen”` : "Ask for places for this trip"}
        onDirective={applyDirective}
      />
    </div>
  );
}

/** A stay, as Discover shows it: the same `EntityCard` Roam uses (4-star, guest score, "£230 / night"). */
export function StayMiniCard({ tripId, stay }: { tripId: string; stay: StayItem }) {
  const router = useRouter();
  const panelCtx = useTripPanelMaybe();
  const href = `/trips/${tripId}/stay/${encodeURIComponent(stay.hotelId)}`;
  const entry: CompareEntry = { id: stay.hotelId, kind: "stay", name: stay.name, href, image: stay.thumbnail ?? undefined, attrs: { price: `${Math.round(stay.nightlyAmount)} ${stay.currency}/night`, priceValue: stay.nightlyAmount, rating: stay.rating != null ? `${stay.rating}/10` : undefined, ratingValue: stay.rating ?? undefined, detail: "Stay" } };
  const open = () => {
    if (!panelCtx) return router.push(href);
    if (panelCtx.compareMode) return panelCtx.compareToggle(entry);
    panelCtx.openPanel({ kind: "stay", hotelId: stay.hotelId, name: stay.name });
  };
  const comparing = Boolean(panelCtx?.compareMode);
  const selected = comparing && Boolean(panelCtx?.compareHas(stay.hotelId));
  return <StayResultCard stay={stay} href={href} onOpen={open} comparing={comparing} selected={selected} />;
}
