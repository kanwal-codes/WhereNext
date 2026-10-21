"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { PanelState } from "@/components/TripPanelProvider";

/** The control that opened the inline panel, so closing it can hand focus back. Module-level because the
 *  inline panel remounts on every subject change and would otherwise forget where the user started. */
let panelOpener: HTMLElement | null = null;

/** Everything the panel does around its content: the phone slide-in deferral, Escape, focus in and out, scroll memory
 *  per subject, and the measured height of the floating ask box. */
export function useTripPanelChrome({ layout, desktop, panel, closePanel, subjectKey, navDirection }: {
  layout: "drawer" | "inline";
  desktop: boolean;
  panel: PanelState | null;
  closePanel: (() => void) | undefined;
  subjectKey: string;
  navDirection: "forward" | "back";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // On a phone the panel is a sheet that slides up. Mounting its (heavy) content while it moves competes with the slide for the same
  // thread, and on a mid-range Android that is the stutter: the sheet arrives with the card's own title and photo first, and the body
  // is built a moment later, once it has stopped.
  const deferBody = layout === "inline" && !desktop;
  const [slid, setSlid] = useState(!deferBody);
  useEffect(() => {
    if (!deferBody) { setSlid(true); return; }
    const id = setTimeout(() => startTransition(() => setSlid(true)), 300);
    return () => clearTimeout(id);
  }, [deferBody]);
  const scrollMem = useRef(new Map<string, number>());
  // How tall the floating ask box (and the answers above it) is right now, so the panel's content can scroll clear of it.
  const [composerHeight, setComposerHeight] = useState(0);
  const composerWatch = useRef<ResizeObserver | null>(null);
  const composerBox = useCallback((el: HTMLDivElement | null) => {
    composerWatch.current?.disconnect();
    composerWatch.current = null;
    if (!el) { setComposerHeight(0); return; }
    const measure = () => setComposerHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    composerWatch.current = new ResizeObserver(measure);
    composerWatch.current.observe(el);
  }, []);

  // Inline (docked chat-rail) panel: Escape closes it, unless the key was meant for something on top
  // of it (an open menu or dialog). The drawer's modal focus / scroll-lock / return-focus is
  // handled by <Sheet> further down.
  useEffect(() => {
    if (layout !== "inline" || !panel || typeof document === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],[role="menu"],[role="listbox"],[aria-modal="true"]')) return;
      closePanel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [layout, panel, closePanel]);
  // Move focus into the inline panel when it opens (and to the new subject when it changes), and hand it
  // back to the control that opened it when it closes — so keyboard and screen-reader users aren't left behind.
  const isOpen = Boolean(panel);
  useEffect(() => {
    if (layout !== "inline") return;
    if (isOpen) {
      const active = document.activeElement as HTMLElement | null;
      if (!panelOpener && active && active !== document.body && !panelRef.current?.contains(active)) panelOpener = active;
      panelRef.current?.focus({ preventScroll: true });
    } else if (panelOpener) {
      panelOpener.focus?.({ preventScroll: true });
      panelOpener = null;
    }
  }, [layout, isOpen, subjectKey]);
  // Scroll memory: remember where each subject was left, restore it on the in-panel Back,
  // land at the top on a forward open.
  useEffect(() => {
    const el = scrollRef.current;
    const mem = scrollMem.current;
    const key = subjectKey;
    return () => { if (el) mem.set(key, el.scrollTop); };
  }, [subjectKey]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || subjectKey === "none") return;
    const target = navDirection === "back" ? scrollMem.current.get(subjectKey) ?? 0 : 0;
    const id = requestAnimationFrame(() => el.scrollTo({ top: target }));
    return () => cancelAnimationFrame(id);
  }, [subjectKey, navDirection]);

  return { scrollRef, panelRef, slid, composerHeight, composerBox };
}
