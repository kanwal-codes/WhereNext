"use client";

import { useEffect, useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { readStayDecision, type StayDecision, type StayDetails, type StayNearbyPlace, type StayPriceRead, type StayPriceSource, type StayReview, type StayRoom, type StayTheme } from "@/packages/contracts/stay";

type State = "loading" | "ready" | "error";

type Body = {
  hotel: StayDetails | null;
  rooms: StayRoom[] | null;
  reviews: StayReview[];
  sentiment: string | null;
  nights: number;
  checkin: string;
  checkout: string;
  currency: string;
  assumedDates: boolean;
  freshness?: { retrievedAt: string };
  /** Google Hotels: who sells it at what price, and how guests rate it. */
  provider?: "serpapi" | "liteapi";
  sources?: StayPriceSource[];
  priceRead?: StayPriceRead | null;
  themes?: StayTheme[];
  ratingCounts?: Array<{ stars: number; count: number }>;
  nearby?: StayNearbyPlace[];
  phone?: string | null;
  website?: string | null;
};

/**
 * Hotel content + dated room rates for one LiteAPI hotel, plus "lock this room"
 * which records the trip's stay decision. Shared by `StayPanel` (chat rail) and
 * the full `/stay/[hotelId]` route so the two can't drift.
 */
export function useStayDetails(
  tripId: string,
  hotelId: string,
  dates: { checkin?: string; checkout?: string; adults?: number; rooms?: number } = {},
) {
  const { data } = useTripData();
  const [body, setBody] = useState<Body | null>(null);
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<StayDecision | null>(null);
  const [attempt, setAttempt] = useState(0);

  const lockedStay = locked ?? readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (dates.checkin) qs.set("checkin", dates.checkin);
    if (dates.checkout) qs.set("checkout", dates.checkout);
    if (dates.adults) qs.set("adults", String(dates.adults));
    if (dates.rooms) qs.set("rooms", String(dates.rooms));
    // One fetch per hotel+dates per session — re-opening the same stay (or bouncing between the
    // panel and the full page) shouldn't re-pull hotel/rooms/reviews. Same 5-minute TTL as the
    // stay search caches (StaySurface, NearbyStays) — rates refresh server-side on that cadence.
    const cacheKey = `stay-details:${tripId}:${hotelId}:${qs.toString()}`;
    const cachedBody = readSessionCache<Body>(cacheKey, 5 * 60_000);
    if (cachedBody) {
      setBody(cachedBody);
      setState(cachedBody.hotel || cachedBody.rooms ? "ready" : "error");
      return () => controller.abort();
    }
    setState("loading");
    setBody(null);
    fetch(`/api/trips/${tripId}/stays/${encodeURIComponent(hotelId)}${qs.toString() ? `?${qs}` : ""}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("details");
        return r.json() as Promise<Body>;
      })
      .then((next) => {
        writeSessionCache(cacheKey, next);
        setBody(next);
        setState(next.hotel || next.rooms ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, hotelId, dates.checkin, dates.checkout, dates.adults, dates.rooms, attempt]);

  async function lockRoom(room: StayRoom) {
    if (!body || busy) return;
    setBusy(true);
    const hotel = body.hotel;
    const value: StayDecision = {
      provider: "liteapi",
      hotelId,
      hotelName: hotel?.name ?? "Hotel",
      roomName: room.name,
      rateId: room.rateId,
      board: room.boardName,
      refundable: room.refundable,
      checkin: body.checkin,
      checkout: body.checkout,
      nights: body.nights,
      nightlyAmount: room.nightlyAmount,
      totalAmount: room.totalAmount,
      currency: room.currency,
      latitude: hotel?.latitude ?? null,
      longitude: hotel?.longitude ?? null,
      address: hotel?.address ?? null,
      thumbnail: hotel?.images[0] ?? null,
    };
    try {
      const r = await fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "record_decision", tripId, kind: "stay", idempotencyKey: "stay", value }),
      });
      if (!r.ok) throw new Error();
      setLocked(value);
      notifyToast(`${value.hotelName} · ${room.name} locked as your stay.`, "success");
      announceWorkspaceChange("decision");
    } catch {
      notifyToast("Could not lock this room.", "error");
    } finally {
      setBusy(false);
    }
  }

  /** Google Hotels has no bookable rate to lock: the choice is the hotel, at the price of the site it will be booked on. */
  async function lockSource(source: StayPriceSource) {
    if (!body || busy) return;
    setBusy(true);
    const hotel = body.hotel;
    const value: StayDecision = {
      provider: "serpapi",
      hotelId,
      hotelName: hotel?.name ?? "Hotel",
      roomName: `Booking on ${source.source}`.slice(0, 120),
      board: null,
      refundable: source.freeCancellation,
      checkin: body.checkin,
      checkout: body.checkout,
      nights: body.nights,
      nightlyAmount: source.nightly,
      totalAmount: source.total,
      currency: body.currency,
      latitude: hotel?.latitude ?? null,
      longitude: hotel?.longitude ?? null,
      address: hotel?.address ?? null,
      thumbnail: hotel?.images[0] ?? null,
    };
    try {
      const r = await fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "record_decision", tripId, kind: "stay", idempotencyKey: "stay", value }),
      });
      if (!r.ok) throw new Error();
      setLocked(value);
      notifyToast(`${value.hotelName} is your stay.`, "success");
      announceWorkspaceChange("decision");
    } catch {
      notifyToast("Could not save this as your stay.", "error");
    } finally {
      setBusy(false);
    }
  }

  const freshness = body?.freshness?.retrievedAt ? new Date(body.freshness.retrievedAt).toLocaleString() : "";

  return {
    hotel: body?.hotel ?? null,
    rooms: body?.rooms ?? null,
    reviews: body?.reviews ?? [],
    sentiment: body?.sentiment ?? null,
    roomsUnavailable: state === "ready" && body?.rooms === null,
    nights: body?.nights ?? 0,
    checkin: body?.checkin ?? dates.checkin ?? "",
    checkout: body?.checkout ?? dates.checkout ?? "",
    currency: body?.currency ?? "CAD",
    assumedDates: body?.assumedDates ?? false,
    freshness,
    state,
    retry: () => setAttempt((n) => n + 1),
    lockedStay,
    busy,
    lockRoom,
    lockSource,
    google: body?.provider === "serpapi",
    sources: body?.sources ?? [],
    priceRead: body?.priceRead ?? null,
    themes: body?.themes ?? [],
    ratingCounts: body?.ratingCounts ?? [],
    nearby: body?.nearby ?? [],
    phone: body?.phone ?? null,
    website: body?.website ?? null,
  };
}
