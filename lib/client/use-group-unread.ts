"use client";

import { useCallback, useEffect, useState } from "react";

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

/** Unread group-chat messages for the viewer (phone menu badge and dot). Counts again when the tab comes back to the front. */
export function useGroupUnread(tripId: string, enabled: boolean): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/trips/${tripId}/group-chat/unread`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { count?: number };
      setCount(typeof body.count === "number" ? body.count : 0);
    } catch {
      // offline: keep the last count
    }
  }, [tripId]);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onFocus = () => document.visibilityState === "visible" && void refresh();
    const onRead = (event: Event) => (event as CustomEvent<string>).detail === tripId && setCount(0);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener(READ_EVENT, onRead);
    const timer = window.setInterval(onFocus, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(READ_EVENT, onRead);
      window.clearInterval(timer);
    };
  }, [enabled, refresh, tripId]);
  return enabled ? count : 0;
}
