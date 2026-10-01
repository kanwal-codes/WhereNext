import type Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const progressBetween = (progress: number, start: number, end: number) =>
  clamp01((progress - start) / (end - start));

export const visibleBetween = (
  progress: number,
  enterStart: number,
  enterEnd: number,
  exitStart = 1,
  exitEnd = 1,
) => progressBetween(progress, enterStart, enterEnd) * (1 - progressBetween(progress, exitStart, exitEnd));

/** Cross-fades a scene back in after a cut (see trackRevisit). */
export const fadeIn = (scene: Element | null) => {
  if (scene) gsap.fromTo(scene, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out", overwrite: true });
};

/**
 * One smoothing step toward `target`. Outside its pin (target 0 or 1) a scene
 * snaps to its first/last frame instead of easing: the smoothing lag is what
 * lets a hard flick — in either direction — leave a scene's frame lingering
 * over its neighbour.
 */
export const smoothStep = (current: number, target: number, rate: number) =>
  target >= 1 || target <= 0 ? target : current + (target - current) * rate;

/**
 * 0 -> 1 while a scene's top edge travels from 85% down the viewport to the
 * top, i.e. while it scrolls in and just before its own pin engages. Scenes
 * use it to fade their first frame in as it rises, rather than after it has
 * already landed — the previous scene has fully cleared by then (each scene
 * fades its own closing content out before its pin ends), so nothing overlaps.
 * It only ever rises: once a scene has come in it stays in, so scrolling back
 * up never fades it out again.
 */
export const trackEntrance = (scene: Element, onProgress: (progress: number) => void) => {
  let furthest = 0;
  const report = (progress: number) => {
    furthest = Math.max(furthest, progress);
    onProgress(furthest);
  };
  return ScrollTrigger.create({
    trigger: scene,
    start: "top 85%",
    end: "top top",
    onUpdate: (self) => report(self.progress),
    onRefresh: (self) => report(self.progress),
  });
};

/** Lets scenes reposition the page through Lenis, which owns the scroll target. */
export const scrollBridge: { lenis: Lenis | null } = { lenis: null };

const jumpTo = (top: number) =>
  requestAnimationFrame(() => {
    if (scrollBridge.lenis) scrollBridge.lenis.scrollTo(top, { immediate: true, force: true });
    else window.scrollTo({ top, behavior: "instant" });
  });

/**
 * "Start a trip" anywhere on the page goes back to the prompt box on the first screen and puts the
 * cursor in it, so every call to action leads to the same place (and the same no-account promise).
 */
export const startTrip = () => {
  const focusBox = () => document.getElementById("trip-prompt")?.focus({ preventScroll: true });
  if (window.scrollY < 8) return focusBox();
  jumpTo(0);
  requestAnimationFrame(() => requestAnimationFrame(focusBox));
};

/**
 * A scene plays once. Returns the progress a pinned scene should display for
 * its ScrollTrigger, remembering how far the visitor has got:
 *
 * - Scrolling back up never rewinds a scene. A finished scene holds its
 *   `resolved` frame for its whole pinned span (it dissolves in over a moment
 *   from the empty frame it leaves behind, rather than scrubbing backwards);
 *   a half-seen scene holds the furthest frame reached.
 * - Scrolling down over a scene already seen starts from that same frame and
 *   only plays the beats after it.
 * - A finished scene's pinned span is skipped: the frame is identical at both
 *   ends, so the page jumps across instead of making the visitor scroll
 *   through a frozen slide.
 */
export const trackRevisit = (resolved: number, distance: number, snap: (target: number) => void) => {
  // Direction is judged by sustained movement, not a single frame's delta: a
  // jump's landing can wobble a few px backwards and must not read as the
  // visitor reversing.
  const INTENT = 30;
  let furthest = 0;
  let lastY = -1;
  let up = 0;
  let down = 0;
  let held = false;
  let lastTarget = 0;
  let landing: { y: number; until: number } | null = null;
  return (self: ScrollTrigger) => {
    const y = self.scroll();
    const progress = self.progress;
    furthest = Math.max(furthest, progress);
    const floor = Math.min(furthest, resolved);

    if (landing && (Math.abs(y - landing.y) < 3 || performance.now() > landing.until)) {
      landing = null;
      up = 0;
      down = 0;
      lastY = y;
    }
    if (!landing && lastY >= 0) {
      const dy = y - lastY;
      if (dy < 0) {
        up -= dy;
        down = 0;
      } else if (dy > 0) {
        down += dy;
        up = 0;
      }
    }
    lastY = y;

    const goingUp = up > INTENT;
    if (furthest >= 1 && !landing) {
      const margin = 40 / distance;
      const leap = (top: number) => {
        landing = { y: top, until: performance.now() + 300 };
        jumpTo(top);
      };
      if (goingUp && progress > 0 && progress < 1 - margin) leap(self.start);
      else if (down > INTENT && progress > margin && progress < floor) leap(self.start + floor * distance);
    }

    const wantHeld = furthest >= 1 && goingUp && progress < 1;
    const target = wantHeld ? floor : Math.max(progress, floor);
    // Switching between the held frame and following the scroll is a cut, not
    // a glide through every beat in between — the scene fades back in instead.
    if (wantHeld !== held && Math.abs(target - lastTarget) > 0.02) snap(target);
    held = wantHeld;
    lastTarget = target;
    return target;
  };
};

export const advanceNarrative = (distance: number) => {
  window.scrollBy({
    top: distance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
};
