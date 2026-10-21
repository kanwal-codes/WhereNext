"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Modal focus plumbing shared by the panel and the mobile nav: focus moves into the
 * dialog on open, `Escape` closes it, the page scroll locks, focus returns to whatever
 * opened it on close, and Tab is kept inside the container.
 */
export function useModalFocus(
  active: boolean,
  onEscape?: () => void,
  container?: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  // A ref, not a dependency: callers almost always pass an inline `() => ...` for onEscape,
  // a fresh function every render. If that sat in the effect's own deps, typing anywhere
  // inside the panel (which re-renders the caller on every keystroke) would re-run this
  // whole effect mid-type — re-focusing the panel's first focusable element and yanking
  // focus out of whatever was just typed into.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // `overflow: hidden` alone stops desktop wheel-scroll but not touch-scroll on mobile
    // Safari, which still rubber-bands the body underneath a fixed overlay — pinning the
    // body in place (and restoring the scroll position on close) blocks both.
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    // Pinning the body (position: fixed) re-lays-out the whole page on open and again on close, which is what Safari needs and what
    // Android Chrome does not: there `overflow: hidden` is enough, and the page stays put.
    const pin = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    if (pin) {
      body.position = "fixed";
      body.top = `-${scrollY}px`;
      body.width = "100%";
    }
    body.overflow = "hidden";
    // <html> carries overflow-x: hidden (app/layout.tsx), which stops `body`'s overflow from reaching the viewport, so on its own the
    // line above locks nothing: the page behind a sheet scrolled under the finger. Lock the root too, keeping a classic scrollbar's width.
    const root = document.documentElement.style;
    const rootPrev = { overflow: root.overflow, paddingRight: root.paddingRight };
    const bar = window.innerWidth - document.documentElement.clientWidth;
    root.overflow = "hidden";
    if (bar > 0) root.paddingRight = `${bar}px`;

    const focusables = () =>
      Array.from(
        container?.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,summary,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !container?.current) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Two frames: the presence child needs to commit before it (and its ref) exist.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const target = initialFocus?.current ?? focusables()[0] ?? container?.current ?? null;
        target?.focus?.({ preventScroll: true } as FocusOptions);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      body.overflow = prev.overflow;
      root.overflow = rootPrev.overflow;
      root.paddingRight = rootPrev.paddingRight;
      if (pin) window.scrollTo(0, scrollY);
      document.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [active, container, initialFocus]);
}
