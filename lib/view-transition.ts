"use client";

/**
 * Shared-element navigation: the trip card's photograph travels into the Overview's hero instead of the page just
 * changing. The browser does the morph (View Transitions API); where it is not available, or the visitor prefers
 * reduced motion, this is an ordinary `router.push`.
 *
 * The clicked card names its cover for the length of the transition; the Overview hero carries the same name
 * (`vtName` on TripCover). The transition's "new" frame is taken only once that hero exists (see ViewTransitionGate),
 * so the morph lands on the photograph and never on a loading skeleton.
 */
type Router = { push: (href: string) => void };
type Doc = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

export const COVER_VT = "trip-cover";
// Keep the shared-element implementation available for a future pass, but do not make trip
// navigation wait on the destination hero. A slow photo or route render must never delay opening a trip.
const ENABLE_SHARED_ELEMENT_TRANSITION = false;
let settle: (() => void) | null = null;

export function openWithTransition(router: Router, href: string, cover: HTMLElement | null) {
  const doc = document as Doc;
  if (!ENABLE_SHARED_ELEMENT_TRANSITION || !doc.startViewTransition || !cover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    router.push(href);
    return;
  }
  cover.style.viewTransitionName = COVER_VT;
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
        router.push(href);
        window.setTimeout(resolve, 2500); // never hold the page hostage
      }),
  );
  void transition.finished.finally(() => {
    cover.style.viewTransitionName = "";
    settle = null;
  });
}

/** Called when the route has changed: resolve the transition once the hero is on screen (or after a short wait). */
export function settleWhenReady() {
  if (!settle) return;
  const started = performance.now();
  const check = () => {
    if (!settle) return;
    if (document.querySelector(`[data-vt-name="${COVER_VT}"]`) || performance.now() - started > 2200) {
      requestAnimationFrame(() => requestAnimationFrame(() => settle?.()));
      return;
    }
    requestAnimationFrame(check);
  };
  check();
}
