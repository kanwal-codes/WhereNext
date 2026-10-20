"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * SSR-safe media query. The server snapshot is `false`, so hydration never mismatches;
 * the client re-renders with the real value on mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}

const noop = () => () => undefined;
/**
 * False on the server and during hydration, true after. Gate a desktop-only subtree on this plus `!useMediaQuery(phone)` so a phone
 * never mounts it: `useMediaQuery` is false for that first render, and a tree that mounts for one tick runs its effects (fetches).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
