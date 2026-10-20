"use client";

import { useEffect, useState } from "react";

const READ_EVENT = "wn:group-read";

/** Tell the server the viewer has the group chat open, and every unread badge on this page to clear. Safe to call often. */
export async function markGroupRead(tripId: string): Promise<void> {
  try {
    const response = await fetch(`/api/trips/${tripId}/group-chat/unread`, { method: "POST" });
    if (response.ok) window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: tripId }));
  } catch {
    // offline: the badge stays as it was
  }
}

/** One count and one poller per trip, however many badges on the page show it (the phone menu and the overview both do). */
type Feed = { count: number; listeners: Set<(count: number) => void>; stop: () => void; refresh: () => Promise<void> };
const feeds = new Map<string, Feed>();

function startFeed(tripId: string): Feed {
  const feed: Feed = { count: 0, listeners: new Set(), stop: () => {}, refresh: async () => {} };
  const set = (count: number) => {
    feed.count = count;
    feed.listeners.forEach((listener) => listener(count));
  };
  let pending: Promise<void> | null = null;
  feed.refresh = () =>
    (pending ??= (async () => {
      try {
        const response = await fetch(`/api/trips/${tripId}/group-chat/unread`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { count?: number };
        set(typeof body.count === "number" ? body.count : 0);
      } catch {
        // offline: keep the last count
      } finally {
        pending = null;
      }
    })());
  const onFocus = () => document.visibilityState === "visible" && void feed.refresh();
  const onRead = (event: Event) => (event as CustomEvent<string>).detail === tripId && set(0);
  document.addEventListener("visibilitychange", onFocus);
  window.addEventListener(READ_EVENT, onRead);
  // Only while the tab is in front: a hidden tab asks nothing (it counts again when it comes back).
  const timer = window.setInterval(onFocus, 60_000);
  feed.stop = () => {
    document.removeEventListener("visibilitychange", onFocus);
    window.removeEventListener(READ_EVENT, onRead);
    window.clearInterval(timer);
  };
  void feed.refresh();
  return feed;
}

/** Unread group-chat messages for the viewer (phone menu badge and dot). Counts again when the tab comes back to the front. */
export function useGroupUnread(tripId: string, enabled: boolean): number {
  const [count, setCount] = useState(() => feeds.get(tripId)?.count ?? 0);
  useEffect(() => {
    if (!enabled) return;
    const feed = feeds.get(tripId) ?? startFeed(tripId);
    feeds.set(tripId, feed);
    setCount(feed.count);
    feed.listeners.add(setCount);
    return () => {
      feed.listeners.delete(setCount);
      if (feed.listeners.size === 0) {
        feed.stop();
        feeds.delete(tripId);
      }
    };
  }, [enabled, tripId]);
  return enabled ? count : 0;
}
