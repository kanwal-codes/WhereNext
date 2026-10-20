import { useEffect, useState } from "react";
import type { EventDetail } from "@/packages/contracts/event";

export type EventSeed = { name: string; url: string; source: string; imageUrl?: string; date?: string; venue?: string };

/** One event's full detail: from this session's cache when it has been seen, else fetched (and kept). `retry` asks again after a failure. */
export function useEventDetail(tripId: string, seed: EventSeed) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `event-detail:v4:${tripId}:${seed.url || seed.name}`;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit) {
        const body = JSON.parse(hit);
        if (body.detail) { setDetail(body.detail); setState("ready"); return () => controller.abort(); }
      }
    } catch { /* unavailable or malformed cache */ }
    setState("loading");
    const q = new URLSearchParams({ name: seed.name, url: seed.url, source: seed.source });
    if (seed.imageUrl) q.set("img", seed.imageUrl);
    if (seed.date) q.set("date", seed.date);
    if (seed.venue) q.set("venue", seed.venue);
    fetch(`/api/trips/${tripId}/events/detail?${q.toString()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("detail"))))
      .then((body) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(body)); } catch { /* ignore */ }
        setDetail(body.detail ?? null);
        setState(body.detail ? "ready" : "error");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [tripId, seed.name, seed.url, seed.source, seed.imageUrl, seed.date, seed.venue, attempt]);

  return { detail, state, retry: () => setAttempt((n) => n + 1) };
}
