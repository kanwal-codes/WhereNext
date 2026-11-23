import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { applyStayFilters, hasStayFilters, type StayFilters } from "@/packages/contracts/stay-filter";
import { addDaysIso } from "@/lib/application/stay-ask";
import { DEEP_BELOW, directivePatch, nightsBetween, initialAdults, staySearchError, stayQueryString, type StaySearchError, type StaySearchResult, type StaySort } from "@/features/stays/domain/stay-search";

/** After this long a search says it is slow, instead of leaving the reader to wonder. */
const SLOW_MS = 8_000;
const KEEP_MS = 5 * 60_000;

type Remembered = {
  startKey: string; checkin: string; checkout: string; adults: number; rooms: number;
  stars: number[]; boards: string[]; propertyTypes: string[]; refundable: boolean; priceMin: number | null; priceMax: number | null; sort: StaySort; near: string;
};

/** What this tab last searched for on this trip, so coming back (the back button, a reload) puts the screen as it was left. */
function recall(tripId: string, startKey: string): Partial<Remembered> | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`stay-state:${tripId}`) ?? "null") as Remembered | null;
    if (!saved) return null;
    const today = new Date().toLocaleDateString("en-CA");
    // Dates are only kept while they are the same trip dates they were chosen against, and still ahead.
    const datesOk = saved.startKey === startKey && saved.checkout >= today;
    return datesOk ? saved : { ...saved, checkin: undefined, checkout: undefined };
  } catch {
    return null;
  }
}

/**
 * The Stay screen's search: the dates, party and filters, and the hotels they find. A multi-city trip is searched one city at a time, for the
 * nights spent there; picking another city moves the search with it.
 *
 * Two kinds of choice live here. The place, dates and party need the hotel sites: changing them searches again. The filters and the order only
 * choose among the hotels already priced, so they are applied here at once, with no request (see `applyStayFilters`); only when they leave
 * too few of a capped first page does a deeper search with them go out.
 */
/** Where a stay search goes: the trip's own route, or the person's with no trip. */
const staysApi = (tripId: string | null) => (tripId ? `/api/trips/${tripId}/stays` : "/api/stays");

export function useStaySearch({ tripId, start, travelers, city, hasChoice, cityWindow, paused = false }: {
  /** Null with no trip: the search then goes to the person's own route and must be told the place. */
  tripId: string | null;
  /** Where the dates start: the booked stay's, the city's nights, or the trip's. */
  start: { checkin: string; checkout: string };
  travelers: number | null | undefined;
  city: string;
  hasChoice: boolean;
  cityWindow: { checkin: string; checkout: string } | null;
  /** True while the search sheet is open: nothing is searched until it closes. */
  paused?: boolean;
}) {
  const startKey = `${start.checkin}|${start.checkout}`;
  // With no trip nothing is remembered: the search starts empty each time.
  const [saved] = useState(() => (typeof window === "undefined" || !tripId ? null : recall(tripId, startKey)));
  const [checkin, setCheckin] = useState(saved?.checkin ?? start.checkin);
  const [checkout, setCheckout] = useState(saved?.checkout ?? start.checkout);
  const [adults, setAdults] = useState(saved?.adults ?? initialAdults(travelers));
  const [rooms, setRooms] = useState(saved?.rooms ?? 1);
  const [stars, setStars] = useState<number[]>(saved?.stars ?? []);
  const [boards, setBoards] = useState<string[]>(saved?.boards ?? []);
  const [propertyTypes, setPropertyTypes] = useState<string[]>(saved?.propertyTypes ?? []);
  const [refundable, setRefundable] = useState(saved?.refundable ?? false);
  const [priceMin, setPriceMin] = useState<number | null>(saved?.priceMin ?? null);
  const [priceMax, setPriceMax] = useState<number | null>(saved?.priceMax ?? null);
  const [sort, setSort] = useState<StaySort>(saved?.sort ?? "price");
  const [near, setNear] = useState(saved?.near ?? ""); // AI "hotels near X" — overrides the destination anchor

  const [base, setBase] = useState<StaySearchResult | null>(null);
  const [basePlace, setBasePlace] = useState("");
  const [deep, setDeep] = useState<{ key: string; result: StaySearchResult } | null>(null);
  const [error, setError] = useState<StaySearchError | null>(null);
  const [loading, setLoading] = useState(true);
  const [deepening, setDeepening] = useState(false);
  const [slow, setSlow] = useState(false);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!tripId) return;
    try {
      sessionStorage.setItem(`stay-state:${tripId}`, JSON.stringify({ startKey, checkin, checkout, adults, rooms, stars, boards, propertyTypes, refundable, priceMin, priceMax, sort, near } satisfies Remembered));
    } catch { /* storage blocked: the screen just starts fresh next time */ }
  }, [tripId, startKey, checkin, checkout, adults, rooms, stars, boards, propertyTypes, refundable, priceMin, priceMax, sort, near]);

  // Picking another city moves the search to that city and the nights spent there.
  const lastCity = useRef(city);
  useEffect(() => {
    if (!hasChoice || lastCity.current === city) return;
    lastCity.current = city;
    setNear("");
    if (cityWindow) {
      setCheckin(cityWindow.checkin);
      setCheckout(cityWindow.checkout);
    }
  }, [city, hasChoice, cityWindow]);

  const filters = useMemo<StayFilters>(
    () => ({ starRatings: stars, boards, refundableOnly: refundable, priceMin: priceMin ?? undefined, priceMax: priceMax ?? undefined, propertyTypes, sort }),
    [stars, boards, refundable, priceMin, priceMax, propertyTypes, sort],
  );
  const filterKey = JSON.stringify(filters);
  // The search itself: place, dates and party. No filter and no order in it, so one answer serves every filter the reader tries.
  const placeNow = `${near}|${hasChoice ? city : ""}`;
  const baseQs = stayQueryString({ adults, rooms, sort: "price", near, city: hasChoice ? city : "", checkin, checkout, stars: [], boards: [], propertyTypes: [], refundable: false, priceMin: null, priceMax: null });

  const search = useCallback(async (fresh = false) => {
    // With no trip there is no place to fall back on: nothing is asked until one is chosen.
    if (!tripId && !baseQs.includes("location=")) { setLoading(false); return; }
    const mine = ++reqId.current;
    // Cancel a still-in-flight prior search instead of just ignoring its response: rapid changes of dates kept every earlier request
    // running against the hotel provider for nothing.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const slowTimer = window.setTimeout(() => { if (mine === reqId.current) setSlow(true); }, SLOW_MS);
    try {
      const cacheKey = `stay-search:v2:${tripId ?? "home"}:${baseQs}`;
      const cachedResult = fresh ? undefined : readSessionCache<StaySearchResult>(cacheKey, KEEP_MS);
      if (cachedResult) {
        if (mine === reqId.current) { setBase(cachedResult); setBasePlace(placeNow); }
        return;
      }
      const response = await fetch(`${staysApi(tripId)}?${baseQs}`, { signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (mine !== reqId.current) return;
      if (!response.ok || !body) {
        // What was already on screen stays there: a failed refresh must not wipe a list the reader was using.
        setError(staySearchError("unavailable"));
        return;
      }
      writeSessionCache(cacheKey, body as StaySearchResult);
      setBase(body as StaySearchResult);
      setBasePlace(placeNow);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (mine === reqId.current) setError(staySearchError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : e instanceof TypeError ? "offline" : "unavailable"));
    } finally {
      window.clearTimeout(slowTimer);
      if (mine === reqId.current) { setLoading(false); setSlow(false); }
    }
  }, [tripId, baseQs, placeNow]);

  // While the search sheet is open its edits are not searched one by one: closing it ("Search stays") asks once, for all of them.
  useEffect(() => {
    if (paused) return;
    // On the next tick, so React's development double-run cancels the first before it asks.
    const timer = window.setTimeout(() => void search(), 0);
    return () => window.clearTimeout(timer);
  }, [search, paused]);

  // What the filters leave of the hotels already priced: at once, with no request.
  const local = useMemo(() => (base ? applyStayFilters(base.options, filters) : []), [base, filters]);
  const deepKey = `${baseQs}|${filterKey}`;
  const deepUsable = deep?.key === deepKey;
  const needsDeeper = Boolean(base?.capped && hasStayFilters(filters) && local.length < DEEP_BELOW && !deepUsable);

  useEffect(() => {
    if (!needsDeeper) { setDeepening(false); return; }
    const controller = new AbortController();
    setDeepening(true);
    // A beat after the last change, so dragging a price slider does not send a search per notch.
    const timer = window.setTimeout(async () => {
      try {
        const qs = stayQueryString({ adults, rooms, sort, near, city: hasChoice ? city : "", checkin, checkout, stars, boards, propertyTypes, refundable, priceMin, priceMax });
        const response = await fetch(`${staysApi(tripId)}?${qs}&deep=1`, { signal: controller.signal });
        if (!response.ok) return;
        setDeep({ key: deepKey, result: (await response.json()) as StaySearchResult });
      } catch { /* the first page's matches stay as they are */ } finally {
        if (!controller.signal.aborted) setDeepening(false);
      }
    }, 450);
    return () => { controller.abort(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deepKey stands for every query input here
  }, [needsDeeper, deepKey, tripId]);

  const result = useMemo<StaySearchResult | null>(() => (base ? { ...base, total: base.total ?? base.options.length, options: deepUsable ? deep!.result.options : local } : null), [base, deepUsable, deep, local]);

  function applyDirective(d: AiSearchDirective) {
    const patch = directivePatch(d);
    if (patch.near !== undefined) setNear(patch.near);
    if (patch.checkin && patch.checkout) { setCheckin(patch.checkin); setCheckout(patch.checkout); }
    else if (patch.checkin || patch.nights) {
      // Only the start was named (or only the length): the stay keeps the length it had, or the one asked for.
      // With no dates chosen yet, the length counts from the dates the list was priced for.
      const from = patch.checkin ?? (checkin || base?.checkin || "");
      const length = patch.nights ?? (nightsBetween(checkin, checkout) || 1);
      if (from) { setCheckin(from); setCheckout(addDaysIso(from, length)); }
    }
    if (patch.priceMin !== undefined) setPriceMin(patch.priceMin);
    if (patch.priceMax !== undefined) setPriceMax(patch.priceMax);
    if (patch.stars) setStars(patch.stars);
    if (patch.boards) setBoards(patch.boards);
    if (patch.propertyTypes) setPropertyTypes(patch.propertyTypes);
    if (patch.refundable !== undefined) setRefundable(patch.refundable);
    if (patch.sort) setSort(patch.sort);
    if (patch.adults) setAdults(patch.adults);
    if (patch.rooms) setRooms(patch.rooms);
  }

  const clearFilters = () => {
    setStars([]);
    setBoards([]);
    setPropertyTypes([]);
    setRefundable(false);
    setPriceMin(null);
    setPriceMax(null);
  };

  return {
    checkin, setCheckin, checkout, setCheckout, adults, setAdults, rooms, setRooms,
    stars, setStars, boards, setBoards, propertyTypes, setPropertyTypes, refundable, setRefundable, priceMin, setPriceMin, priceMax, setPriceMax, sort, setSort, near, setNear,
    result, error, loading, slow, deepening, pricing: loading && Boolean(base) && basePlace === placeNow, // True from the moment the place changes until its own list is in (or its search has failed): the old place's list is never shown for the new one.
    placeChanged: Boolean(base) && basePlace !== placeNow, search, applyDirective, clearFilters,
  };
}
