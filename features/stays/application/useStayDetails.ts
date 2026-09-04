"use client";

import { useEffect, useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { readStayDecision, type StayDecision, type StayDetails, type StayReview, type StayRoom } from "@/packages/contracts/stay";

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
};

/**
 * Hotel content + dated room rates for one LiteAPI hotel, plus "lock this room"
 * which records the trip's stay decision. Shared by `StayPanel` (chat rail) and
 * the full `/stay/[hotelId]` route so the two can't drift.
 */
export function useStayDetails(
  tripId: string,
  hotelId: string,
  dates: { checkin?: string; checkout?: string; adults?: number } = {},
) {
  const { data } = useTripData();
  const [body, setBody] = useState<Body | null>(null);
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<StayDecision | null>(null);

  const lockedStay = locked ?? readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (dates.checkin) qs.set("checkin", dates.checkin);
    if (dates.checkout) qs.set("checkout", dates.checkout);
    if (dates.adults) qs.set("adults", String(dates.adults));
    // One fetch per hotel+dates per session — re-opening the same stay (or bouncing
    // between the panel and the full page) shouldn't re-pull hotel/rooms/reviews.
    const cacheKey = `stay-details:${tripId}:${hotelId}:${qs.toString()}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const next = JSON.parse(cached) as Body;
        setBody(next);
        setState(next.hotel || next.rooms ? "ready" : "error");
        return () => controller.abort();
      }
    } catch { /* unavailable or malformed cache */ }
    setState("loading");
    setBody(null);
    fetch(`/api/trips/${tripId}/stays/${encodeURIComponent(hotelId)}${qs.toString() ? `?${qs}` : ""}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("details");
        return r.json() as Promise<Body>;
      })
      .then((next) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* ignore */ }
        setBody(next);
        setState(next.hotel || next.rooms ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, hotelId, dates.checkin, dates.checkout, dates.adults]);

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
    lockedStay,
    busy,
    lockRoom,
  };
}
