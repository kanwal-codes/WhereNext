import { useCallback, useEffect, useRef, useState } from "react";
import type { AiSearchDirective } from "@/lib/application/ai-search";
import { cachedGet } from "@/lib/client/cached-get";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { SEARCH_FAILED, directivePatch, initialAdults, statusFor, stayQueryString, type StaySearchResult, type StaySort } from "@/features/stays/domain/stay-search";

/**
 * The Stay screen's search: the dates, party and filters, and the hotels they find. A multi-city trip is searched one city at a time, for the
 * nights spent there; picking another city moves the search with it.
 */
export function useStaySearch({ tripId, start, travelers, city, hasChoice, cityWindow }: {
  tripId: string;
  /** Where the dates start: the booked stay's, the city's nights, or the trip's. */
  start: { checkin: string; checkout: string };
  travelers: number | null | undefined;
  city: string;
  hasChoice: boolean;
  cityWindow: { checkin: string; checkout: string } | null;
}) {
  const [checkin, setCheckin] = useState(start.checkin);
  const [checkout, setCheckout] = useState(start.checkout);
  const [adults, setAdults] = useState(initialAdults(travelers));
  const [rooms, setRooms] = useState(1);
  const [stars, setStars] = useState<number[]>([]);
  const [boards, setBoards] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [refundable, setRefundable] = useState(false);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [sort, setSort] = useState<StaySort>("price");
  const [near, setNear] = useState(""); // AI "hotels near X" — overrides the destination anchor

  const [result, setResult] = useState<StaySearchResult | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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

  const search = useCallback(async () => {
    const mine = ++reqId.current;
    // Cancel a still-in-flight prior search instead of just ignoring its response — otherwise
    // rapid filter changes (stars, boards, dates) kept every earlier request running against the
    // hotel provider for nothing, same fix DiscoverySurface already has for its own searches.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setStatus("");
    try {
      const qs = stayQueryString({ adults, rooms, sort, near, city: hasChoice ? city : "", checkin, checkout, stars, boards, propertyTypes, refundable, priceMax });
      const cacheKey = `stay-search:${tripId}:${qs}`;
      const cachedResult = readSessionCache<StaySearchResult>(cacheKey, 5 * 60_000);
      if (cachedResult) {
        if (mine !== reqId.current) return;
        setResult(cachedResult);
        setStatus(statusFor(cachedResult));
        return;
      }

      const response = await cachedGet(`/api/trips/${tripId}/stays?${qs}`, { signal: controller.signal });
      const body = await response.json();
      if (mine !== reqId.current) return;
      if (!response.ok) {
        setResult(null);
        setStatus(SEARCH_FAILED);
        return;
      }
      const next = body as StaySearchResult;
      writeSessionCache(cacheKey, next);
      setResult(next);
      setStatus(statusFor(next));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (mine === reqId.current) {
        setResult(null);
        setStatus(SEARCH_FAILED);
      }
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [tripId, adults, rooms, sort, checkin, checkout, stars, boards, propertyTypes, refundable, priceMax, near, hasChoice, city]);

  useEffect(() => {
    void search();
  }, [search]);

  function applyDirective(d: AiSearchDirective) {
    const patch = directivePatch(d);
    if (patch.near !== undefined) setNear(patch.near);
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
    setPriceMax(null);
  };

  return {
    checkin, setCheckin, checkout, setCheckout, adults, setAdults, rooms, setRooms,
    stars, setStars, boards, setBoards, propertyTypes, setPropertyTypes, refundable, setRefundable, priceMax, setPriceMax, sort, setSort, near, setNear,
    result, status, loading, search, applyDirective, clearFilters,
  };
}
