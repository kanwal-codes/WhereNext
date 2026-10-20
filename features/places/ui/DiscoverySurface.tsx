"use client";

import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SwapView } from "@/components/SwapView";
import { StayResultCard } from "@/features/stays/ui/StayResultCard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BedDouble, Compass, Heart, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { useTripData } from "@/components/TripDataProvider";
import { CityChips } from "@/components/CityChips";
import { useTripCity } from "@/lib/client/use-trip-city";
import { stayWindow } from "@/lib/trip-stops";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { AiSearchBar } from "@/components/AiSearchBar";
import { useTripPanelMaybe, type CompareEntry } from "@/components/TripPanelProvider";
import { useShowMore } from "@/lib/use-show-more";
import { ShowMoreButton } from "@/components/ShowMoreButton";
import { PlaceCard } from "@/components/PlaceCard";
import { rankPlaces } from "@/lib/application/rank-places";
import { usesMiles } from "@/lib/application/geo";
import { readStayDecision } from "@/packages/contracts/stay";
import { EventCard } from "@/components/EventCard";
import type { NearbyEvent } from "@/lib/application/nearby-events";
import { SkeletonBand, SkeletonList } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { CATEGORIES, CATEGORY_BY_KEY, type DiscoverCategory } from "./discoverTaxonomy";
import { appendEvents, digestBands, directiveAction, flatFeed, interestTerms, interestsKeyOf, rankContext, scopeQuery, searchResults, staysInBands, toStayItem, asList, num, type Band, type Item, type StayItem } from "../domain/discover";
import { cn } from "@/lib/utils";
import { cachedGet } from "@/lib/client/cached-get";
import { DiscoverTile } from "@/features/places/ui/DiscoverTile";
import { CompareMark } from "@/features/conversation/ui/blocks/ui";
import { formatMoney } from "@/lib/currency";
import { CityPill } from "@/components/CityPill";
import { PHONE_ROUND, useSetPhoneHeader } from "@/components/shell/PhoneHeader";
import { useMediaQuery } from "@/lib/use-media-query";
import { PHONE_V2 } from "@/lib/phone-v2";
import Link from "next/link";


/**
 * Raw category results, cached per session so tabbing Eat → Nightlife → Eat
 * doesn't re-hit the API each time. Keyed on trip + category + sub-filters; the
 * *ranking* is re-applied on every read, so a fresh shortlist still reorders.
 */
const categoryRawCache = new Map<string, Place[] | NearbyEvent[] | StayItem[]>();

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
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // A multi-city trip shows one city at a time (the one the group is in, or the one picked); a one-city trip is just its destination.
  const cities = useTripCity(data?.trip);
  const destination = cities.hasChoice ? cities.city : (data?.trip.destination?.trim() ?? "");
  // Phone redesign: the city is the pill in the middle of the header, and Saved is the heart at its right edge (no Discover | Saved switch).
  const cityLabel = (cities.hasChoice ? cities.city : destination).split(",")[0].trim();
  const headerTitle = useMemo(() => (phone && cityLabel ? <CityPill stops={cities.stops} city={cityLabel} onPick={cities.setCity} /> : undefined), [phone, cityLabel, cities.stops, cities.setCity]);
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const interestsKey = interestsKeyOf(prefs);
  const interests = useMemo(() => interestTerms(interestsKey), [interestsKey]);

  /** Anchor a free-text query to the trip's destination unless it already names a place (`force`: it is a list of interests). */
  const scope = useCallback((q: string, force = false) => scopeQuery(q, destination, { force }), [destination]);

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
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("places")) refreshSaved();
    });
  }, [refreshSaved, initialSaved]);
  useEffect(() => {
    onSavedCountChange?.(saved.length);
  }, [saved.length, onSavedCountChange]);

  const headerHeart = useMemo(
    () => phone ? (
      <button
        type="button"
        onClick={() => onViewChange(view === "saved" ? "results" : "saved")}
        aria-pressed={view === "saved"}
        aria-label={view === "saved" ? "Back to ideas" : `Saved places${saved.length ? `, ${saved.length}` : ""}`}
        className={cn(PHONE_ROUND, "relative", view === "saved" && "border-foreground bg-foreground text-background")}
      >
        <Heart className={cn("size-[1.2rem]", view === "saved" && "fill-current")} />
        {view !== "saved" && saved.length > 0 && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
      </button>
    ) : undefined,
    [phone, view, saved.length, onViewChange],
  );
  useSetPhoneHeader({ titleNode: headerTitle, trailing: headerHeart });

  // --- filter + feed state ------------------------------------------
  const [catKey, setCatKey] = useState<string | null>(null); // null = "All"
  const [subs, setSubs] = useState<string[]>([]);
  const [searchLabel, setSearchLabel] = useState(""); // what the AI search resolved to, for the "Clear" chip
  // Arriving with a query (`?q=`) starts in search mode, so the default feed never starts beside that search and discards its results.
  const [searchMode, setSearchMode] = useState(Boolean(initialQuery));

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
    async (q: string, signal?: AbortSignal, limit?: number, force = false): Promise<Place[]> => {
      const r = await cachedGet(`/api/trips/${tripId}/places?query=${encodeURIComponent(scope(q, force))}${limit ? `&limit=${limit}` : ""}`, { signal });
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
    const window = cities.hasChoice && cities.stop ? stayWindow(cities.stop) : null;
    const qs = new URLSearchParams(cities.hasChoice ? { location: destination } : {});
    if (window) {
      qs.set("checkin", window.checkin);
      qs.set("checkout", window.checkout);
    }
    const r = await cachedGet(`/api/trips/${tripId}/stays${qs.size ? `?${qs}` : ""}`, { signal });
    const body = await r.json().catch(() => ({}));
    return r.ok ? ((body.options ?? []) as Array<Record<string, unknown>>).map(toStayItem).filter((s) => s.hotelId) : [];
  }, [tripId, destination, cities.hasChoice, cities.stop]);

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
  const rankCtx = useMemo(
    () => rankContext({ prefs, dislikesKey, savedKey, rejectedKey, itinKey, stayKey, miles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitive keys stand in for the object deps
    [interestsKey, dislikesKey, savedKey, rejectedKey, itinKey, stayKey, miles],
  );
  // `typed`: a search the reader wrote. The provider's order is the answer to it, so it is kept; browsing a category is still ranked by how well known and how close.
  const rankToItems = useCallback(
    (places: Place[], typed = false): Item[] => rankPlaces(places, { ...rankCtx, providerOrder: typed }).map((r) => ({ kind: "place", place: r.place, why: r.why })),
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
    // A band shows six and "See all" opens the category with its own full search, so one page (20) each:
    // 60 was three sequential Google pages and ~300 KB per band, four bands per load.
    const [forYou, sights, eat, tours, ev, st] = await Promise.allSettled([
      // A list of interests ("food, art") is not a place name, so it is anchored to the destination like any other query.
      fetchPlaces(interests.length ? interests.join(", ") : "highly rated things to do", controller.signal, 20, interests.length > 0),
      fetchPlaces("top sights and landmarks", controller.signal, 20),
      fetchPlaces("restaurants and cafes", controller.signal, 20),
      fetchPlaces("guided tours", controller.signal, 20),
      fetchEvents("", 0, controller.signal),
      fetchStays(controller.signal),
    ]);
    if (mine !== reqId.current) return;
    const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value : []);
    const next = digestBands({ sights: ok(sights), forYou: ok(forYou), eat: ok(eat), tours: ok(tours), events: ok(ev), stays: ok(st), interests, destination, rank: rankToItems });
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
        const cacheKey = `${tripId}:${destination}:${cat.key}:${cat.kind === "stay" ? "" : [...chosen].sort().join("|")}`;
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
          next = staysInBands(all, chosen, (l) => Number(subQ(l))).map((s) => ({ kind: "stay", stay: s }));
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
    [tripId, destination, fetchPlaces, fetchEvents, fetchStays, rankToItems],
  );

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setSearchMode(true);
      setCatKey(null);
      setSubs([]);
      setLoading(true);
      setMessage("");
      const mine = ++reqId.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const eventCategory = CATEGORY_BY_KEY.get("events");
        const eventIntent = eventCategory && q.toLowerCase().includes("concert");
        const found = eventIntent ? [] : await fetchPlaces(q, controller.signal);
        const places = searchResults(found, scope(q) !== q, destination);
        const events = eventIntent ? await fetchEvents(q, 0, controller.signal) : [];
        if (mine !== reqId.current) return;
        setItems(eventIntent ? events.map((event) => ({ kind: "event", event }) as Item) : rankToItems(places, true));
        setLoading(false);
        const count = eventIntent ? events.length : places.length;
        setMessage(count ? "" : "Nothing came back — try different words.");
      } catch (error) {
        if (mine !== reqId.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoading(false);
        setMessage("Nothing came back — try different words.");
      }
    },
    [fetchPlaces, fetchEvents, rankToItems, scope, destination],
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
    setSubs([]);
    setCatKey(key);
  }

  function applyDirective(d: AiSearchDirective, raw: string) {
    const action = directiveAction(d, raw, (k) => CATEGORY_BY_KEY.has(k));
    if (action.kind === "category") {
      pickCategory(action.category);
      if (action.subs.length) setSubs(action.subs);
    } else {
      void runSearch(action.query);
    }
    setSearchLabel(action.label);
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
  async function loadMoreEvents() {
    if (eventsBusy || !eventPaging.current.more) return;
    setEventsBusy(true);
    const { q, page } = eventPaging.current;
    try {
      const next = await fetchEvents(q, page + 1);
      eventPaging.current = { q, page: page + 1, more: next.length > 0 };
      setItems((current) => appendEvents(current, next));
    } finally {
      setEventsBusy(false);
    }
  }

  // In a band on a phone each card is a swipeable slide (the next one peeks in), not a half-width tile: two to a row cramped the buttons.
  const slide = "max-sm:w-[15.5rem] max-sm:shrink-0 max-sm:snap-start";
  // From sm up the cards are about 11:10, not 3:4: three across a wide screen made each one 350px wide and 470 tall. 11:10 is the height the
  // Discover cards had before the cinematic ones (a 16:10 photo with its text under it, roughly 330px at this width).
  const squareOnWide = "sm:[&_article]:aspect-[11/10]";
  const renderItem = (item: Item, inRail = false, row = false) => {
    if (item.kind === "place") {
      return (
        <StaggerItem key={`p:${item.place.providerId}`} className={cn(squareOnWide, inRail && slide)}>
          <PlaceCard tripId={tripId} place={item.place} why={item.why ?? undefined} phoneRow={row} />
        </StaggerItem>
      );
    }
    if (item.kind === "event") {
      return (
        <StaggerItem key={`e:${item.event.url}|${item.event.date ?? ""}`} className={cn(squareOnWide, inRail && slide)}>
          <EventCard tripId={tripId} event={item.event} phoneRow={row} />
        </StaggerItem>
      );
    }
    return (
      <StaggerItem key={`s:${item.stay.hotelId}`} className={cn(squareOnWide, inRail && slide)}>
        <StayMiniCard tripId={tripId} stay={item.stay} phoneRow={row} />
      </StaggerItem>
    );
  };

  // ---- Phone redesign: ask field, one chip row with a filter button, a wide first result, then two to a row. ----
  const phoneFlat = useMemo(() => flatFeed(bands), [bands]);
  const phoneItems = view === "saved" ? savedItems : gridView ? items : phoneFlat;
  // The "All" feed pages too: a first screenful of everything, then "Show more", like each category does.
  const flatMore = useShowMore(phoneFlat.length, phoneFlat, { first: 9, step: 9 });
  const phoneMore = view === "saved" || gridView ? gridMore : flatMore;
  const phoneShown = phoneItems.slice(0, phoneMore.visible);
  const phoneTile = (item: Item, mode: "feature" | "grid") =>
    item.kind === "place" ? <PlaceCard key={`p:${item.place.providerId}`} tripId={tripId} place={item.place} why={item.why ?? undefined} phoneTile={mode} />
    : item.kind === "event" ? <EventCard key={`e:${item.event.url}|${item.event.date ?? ""}`} tripId={tripId} event={item.event} phoneTile={mode} />
    : <StayMiniCard key={`s:${item.stay.hotelId}`} tripId={tripId} stay={item.stay} phoneTile={mode} />;
  const askQuery = searchLabel || activeCat?.label || "";
  const filterCount = subs.length + (panelCtx?.compareMode ? 1 : 0);

  // Columns follow the width of this area, not the window, so an open side panel does not squeeze the cards.
  const grid = "grid gap-4 sm:grid-cols-2 @[46rem]:grid-cols-3";

  return (
    <div className={cn("@container flex min-h-[calc(100svh-13rem)] flex-col", PHONE_V2 && "max-lg:pb-24")}>
      {view === "results" && !phone && <CityChips stops={cities.stops} current={cities.city} onPick={cities.setCity} estimated={cities.estimated} className="mt-3 -mb-1" />}
      {phone && view === "results" && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="-mr-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain pr-6 no-scrollbar [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
              {searchMode && searchLabel ? (
                <button type="button" onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }} aria-label={`Clear search: ${searchLabel}`} className="btn-chip max-w-[16rem] shrink-0">
                  <span className="truncate">{searchLabel}</span> <X className="size-3.5 shrink-0" aria-hidden />
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => pickCategory(null)} aria-pressed={catKey === null} className="btn-chip shrink-0">All</button>
                  {CATEGORIES.map((c) => {
                    const on = catKey === c.key;
                    return (
                      <button key={c.key} type="button" onClick={() => pickCategory(on ? null : c.key)} aria-pressed={on} className="btn-chip shrink-0">
                        {c.label}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-pressed={filtersOpen}
              aria-label={filterCount ? `Filters, ${filterCount} on` : "Filters"}
              className={cn("relative grid size-11 shrink-0 place-items-center rounded-full border border-input bg-background transition-colors", PHONE_V2 && "max-lg:border-0 max-lg:bg-secondary", filtersOpen && "border-foreground bg-foreground text-background", PHONE_V2 && filtersOpen && "max-lg:bg-foreground")}
            >
              <SlidersHorizontal className="size-[1.125rem]" aria-hidden />
              {filterCount > 0 && !filtersOpen && <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-coral ring-2 ring-background" />}
            </button>
          </div>
          {/* On a phone the filter chips float over the feed instead of pushing it down and pulling it back up: opening and closing move nothing underneath, so there is nothing to jitter. */}
          <div className={cn(PHONE_V2 && phone && "relative h-0")}>
          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                initial={PHONE_V2 && phone ? { opacity: 0, y: -6, scale: 0.98 } : { opacity: 0, height: 0 }}
                animate={PHONE_V2 && phone ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, height: "auto" }}
                exit={PHONE_V2 && phone ? { opacity: 0, y: -6, scale: 0.98 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn(PHONE_V2 && phone ? "absolute inset-x-0 top-1 z-30 origin-top rounded-2xl border border-border bg-card p-3 shadow-lift" : "overflow-hidden")}
              >
                <div className="flex flex-wrap gap-2 pb-1">
                  {panelCtx && (
                    <button type="button" onClick={() => { panelCtx.setCompareMode(!panelCtx.compareMode); panelCtx.compareClear(); }} aria-pressed={panelCtx.compareMode} className="btn-chip">
                      {panelCtx.compareMode ? `Comparing · ${panelCtx.compareList.length}` : "Compare places"}
                    </button>
                  )}
                  {activeCat?.subs.map((s) => (
                    <button key={s.label} type="button" onClick={() => toggleSub(s.label)} aria-pressed={subs.includes(s.label)} className="btn-chip">{s.label}</button>
                  ))}
                  {subs.length > 0 && <button type="button" onClick={() => setSubs([])} className="px-2 text-sm text-muted-foreground">Clear</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      )}
      {phone && view === "saved" && (
        <h2 className="pt-2 font-display text-title leading-tight font-medium tracking-[-0.03em]">Saved places <span className="ml-1 text-lg text-muted-foreground tabular-nums">{saved.length}</span></h2>
      )}

      {/* Tier 1 — Compare + broad categories (Discover/Saved lives in the page header now). One row, scrolls sideways. */}
      {view === "results" && !phone && (!searchMode || panelCtx || searchLabel) && (
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
            {/* What the search resolved to, as a chip that clears it: the one way back to the digest while the category chips are away. */}
            {searchMode && searchLabel && (
              <button
                type="button"
                onClick={() => { setSearchMode(false); setSearchLabel(""); pickCategory(null); }}
                aria-label={`Clear search: ${searchLabel}`}
                className="btn-chip max-w-[18rem] shrink-0"
              >
                <span className="truncate">{searchLabel}</span> <X className="size-3.5 shrink-0" aria-hidden />
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
                        // Pressing the chosen category again lets go of it: back to the whole digest.
                        onClick={() => pickCategory(on ? null : c.key)}
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
        {view === "results" && !phone && activeCat && activeCat.subs.length > 0 && (
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
                <button type="button" onClick={() => setSubs([])} className="shrink-0 rounded-full px-2 py-1 text-2xs text-muted-foreground transition-colors hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {message && <p className="mt-3 text-xs text-muted-foreground max-lg:hidden">{message}</p>}

      {/* Feed: each state (skeleton, grid, digest) crossfades into the next. */}
      <div className="relative">
        <SwapView id={loading && gridItems.length === 0 && (bands === null || gridView) ? "skeleton" : gridView ? "grid" : loading && !bands ? "digest-loading" : "digest"}>
      {phone && !(loading && phoneItems.length === 0) ? (
        phoneShown.length > 0 ? (
          <div className="mt-5 flex flex-col gap-5">
            {phoneTile(phoneShown[0], "feature")}
            {phoneShown.length > 1 && <div className="grid grid-cols-2 gap-x-3 gap-y-6">{phoneShown.slice(1).map((it) => phoneTile(it, "grid"))}</div>}
            {phoneMore.remaining > 0 && <ShowMoreButton next={phoneMore.next} visible={phoneMore.visible} total={phoneItems.length} onClick={phoneMore.showMore} noun="results" />}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center px-3 text-center">
            <span aria-hidden className="grid size-16 place-items-center rounded-full bg-coral-soft text-coral-ink">{view === "saved" ? <Heart className="size-7" /> : <Compass className="size-7" />}</span>
            <h2 className="mt-5 font-display text-2xl font-medium tracking-[-0.03em]">{view === "saved" ? "Nothing saved yet" : "Nothing matched that"}</h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft text-pretty">
              {view === "saved"
                ? "Tap the heart on a place and it lands here. Roam can suggest a few to start."
                : destination
                  ? `${askQuery ? `No ${askQuery.toLowerCase()}` : "Nothing"} for these dates. Try a wider area, or let Roam look.`
                  : "Set a destination for this trip to see ideas here."}
            </p>
            {view !== "saved" && destination && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {CATEGORIES.slice(0, 2).map((c) => (
                  <button key={c.key} type="button" onClick={() => pickCategory(c.key)} className="btn-chip">{c.label}</button>
                ))}
              </div>
            )}
            <Link prefetch={false} href={`/trips/${tripId}/chat${askQuery ? `?ask=${encodeURIComponent(askQuery)}` : ""}`} className="btn-primary mt-5 h-12 rounded-full px-6">
              <Sparkles className="size-4" aria-hidden /> {view === "saved" ? "Ask Roam for ideas" : "Ask Roam instead"}
            </Link>
          </div>
        )
      ) : loading && gridItems.length === 0 && (bands === null || gridView) ? (
        gridView ? <SkeletonList count={6} className="mt-5 @[46rem]:grid-cols-3" /> : <SkeletonBand count={6} className="mt-5" />
      ) : gridView ? (
        gridItems.length > 0 ? (
          <>
            <Stagger className={cn(grid, "mt-5")}>{gridItems.slice(0, gridMore.visible).map((it) => renderItem(it, false, true))}</Stagger>
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
          {loading && !bands ? (
            <SkeletonBand count={6} className="mt-4" />
          ) : !bands || bands.length === 0 ? (
            <EmptyState icon={Compass} className="mt-8">
              {destination ? "Nothing came back just now. Try a search or a different category." : "Set a destination for this trip to see ideas here."}
            </EmptyState>
          ) : (
            <div className="mt-4 space-y-9">
              {(bands ?? []).map((band) => (
                <section key={band.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg">{band.label}</h3>
                    {band.key && (
                      <button type="button" onClick={() => pickCategory(band.key)} className="shrink-0 text-xs font-medium text-primary hover:underline relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
                        See all &rarr;
                      </button>
                    )}
                  </div>
                  {/* Two rows of three per band; the rest lives behind "See all". */}
                  <Stagger className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 max-sm:-mx-5 max-sm:-mb-10 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:items-stretch max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:px-5 max-sm:pt-2 max-sm:pb-10 max-sm:scroll-px-5 no-scrollbar">
                    {band.items.slice(0, 6).map((it) => renderItem(it, true))}
                  </Stagger>
                  {band.key && band.items.length > 6 && (
                    <button
                      type="button"
                      onClick={() => pickCategory(band.key)}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft transition-colors hover:bg-accent max-sm:hidden"
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

      {/* Last in the column so it can rest on the bottom edge of the page (see `.ask-dock`). On a phone it is the same floating bar, with a shorter prompt. */}
      {(!phone || view === "results") && <AiSearchBar
        variant="dock"
        tripId={tripId}
        scope="discover"
        placeholder={phone ? "Ask Roam about places" : destination ? `Ask — “rooftop bars near ${destination.split(",")[0].trim()}”, “kid-friendly museums”, “ramen”` : "Ask for places for this trip"}
        onDirective={applyDirective}
      />}
    </div>
  );
}

/** A stay, as Discover shows it: the same `EntityCard` Roam uses (4-star, guest score, "£230 / night"). */
function StayMiniCard({ tripId, stay, phoneRow = false, phoneTile }: { tripId: string; stay: StayItem; phoneRow?: boolean; phoneTile?: "feature" | "grid" }) {
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
  if (phoneTile) {
    return (
      <DiscoverTile
        label={`Open ${stay.name}`}
        onOpen={open}
        href={href}
        src={stay.thumbnail}
        icon={BedDouble}
        title={stay.name}
        meta={stay.nightlyAmount > 0 ? `${formatMoney(stay.nightlyAmount, stay.currency)} / night` : "Stay"}
        rating={stay.rating}
        feature={phoneTile === "feature"}
        selected={selected}
        overlay={comparing ? <CompareMark selected={selected} /> : undefined}
      />
    );
  }
  return <StayResultCard stay={stay} href={href} onOpen={open} comparing={comparing} selected={selected} phoneRow={phoneRow} />;
}
