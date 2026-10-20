import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@/packages/contracts/place";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import type { NearbyEvent } from "@/lib/application/nearby-events";
import { rankPlaces } from "@/lib/application/rank-places";
import { usesMiles } from "@/lib/application/geo";
import { cachedGet } from "@/lib/client/cached-get";
import { stayWindow } from "@/lib/trip-stops";
import { readStayDecision } from "@/packages/contracts/stay";
import { CATEGORY_BY_KEY, type DiscoverCategory } from "../ui/discoverTaxonomy";
import { appendEvents, asList, digestBands, directiveAction, num, rankContext, scopeQuery, searchResults, staysInBands, toStayItem, type Band, type Item, type StayItem } from "../domain/discover";

/**
 * Raw category results, cached per session so tabbing Eat → Nightlife → Eat
 * doesn't re-hit the API each time. Keyed on trip + category + sub-filters; the
 * *ranking* is re-applied on every read, so a fresh shortlist still reorders.
 */
const categoryRawCache = new Map<string, Place[] | NearbyEvent[] | StayItem[]>();

/**
 * What Discover shows: the filter state (category, sub-chips, search), and the feed behind it — the "All" digest, one category,
 * or a search — with the requests, caching and ranking each needs. A newer request always replaces an older one.
 */
export function useDiscoverFeed({ tripId, destination, cities, view, data, prefs, saved, interests, interestsKey, initialQuery }: {
  tripId: string;
  destination: string;
  cities: { hasChoice: boolean; stop: Parameters<typeof stayWindow>[0] | null };
  view: "results" | "saved";
  data: { rejectedPlaceIds?: string[]; itinerary?: Array<Record<string, unknown>>; decisions?: unknown[] } | null | undefined;
  prefs: Record<string, unknown>;
  saved: Place[];
  interests: string[];
  interestsKey: string;
  initialQuery?: string;
}) {
  /** Anchor a free-text query to the trip's destination unless it already names a place (`force`: it is a list of interests). */
  const scope = useCallback((q: string, force = false) => scopeQuery(q, destination, { force }), [destination]);

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

  return { catKey, subs, setSubs, searchLabel, setSearchLabel, searchMode, setSearchMode, bands, items, loading, message, eventsBusy, moreEvents: eventPaging.current.more, pickCategory, applyDirective, toggleSub, loadMoreEvents };
}
