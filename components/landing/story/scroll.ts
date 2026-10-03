"use client";

/**
 * The story's one scroll listener. Every entrance on the page is a function of where an element
 * is on screen, never of a timer, so what a visitor sees depends only on the scroll position:
 * scrolling fast, slowly, down, up or jumping gives the same frame at the same offset.
 *
 * - An element reveals as its top climbs from 90% to 78% of the window height, then stays (a
 *   scene plays once; scrolling back up never takes it away again).
 * - `calm()` says whether the visitor is moving slowly enough to be reading, for set pieces that
 *   run on a clock (the typed message, the desk settling).
 */

type Item = { el: HTMLElement; offset: number };

const items = new Set<Item>();
const watchers = new Set<() => void>();
let frame = 0;
let lastY = 0;
let lastT = 0;
let speed = 0; // px per second, smoothed
let calmSince = 0;
let tail = 0;
let bound = false;

const REVEAL_FROM = 0.93;
const REVEAL_SPAN = 0.13;
const CALM_SPEED = 700;
const TAIL = 260; // ms after the last scroll event

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function finish(item: Item) {
  item.el.style.removeProperty("--r");
  item.el.dataset.done = "";
  items.delete(item);
}

function run() {
  frame = 0;
  const vh = window.innerHeight;
  for (const item of items) {
    const top = item.el.getBoundingClientRect().top + item.offset;
    const r = Math.min(1, Math.max(0, (vh * REVEAL_FROM - top) / (vh * REVEAL_SPAN)));
    const prev = Number(item.el.style.getPropertyValue("--r") || 0);
    if (r >= 1) finish(item);
    else if (r > prev) item.el.style.setProperty("--r", r.toFixed(3));
  }
  watchers.forEach((fn) => fn());
}

function onScroll() {
  const now = performance.now();
  const y = window.scrollY;
  if (lastT) {
    const dt = Math.max(1, now - lastT);
    speed = speed * 0.6 + ((Math.abs(y - lastY) / dt) * 1000) * 0.4;
  }
  lastY = y;
  lastT = now;
  if (speed > CALM_SPEED) calmSince = 0;
  else if (!calmSince) calmSince = now;
  if (!frame) frame = requestAnimationFrame(run);
  // Once scrolling stops nothing else would wake the watchers, and a set piece may be waiting for exactly that.
  window.clearTimeout(tail);
  tail = window.setTimeout(() => watchers.forEach((fn) => fn()), TAIL);
}

function bind() {
  if (bound) return;
  bound = true;
  lastY = window.scrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
}

/** Starts revealing an element by position. `offset` (px) delays it a little further down the scroll, for stagger. Returns a cleanup. */
export function reveal(el: HTMLElement, offset = 0) {
  if (reduced()) {
    el.dataset.done = "";
    return () => undefined;
  }
  bind();
  const item: Item = { el, offset };
  items.add(item);
  if (!frame) frame = requestAnimationFrame(run);
  return () => {
    items.delete(item);
  };
}

/** Called after every scroll frame (and once per `kick`). For set pieces that need to know where things are. */
export function watch(fn: () => void) {
  bind();
  watchers.add(fn);
  fn();
  return () => {
    watchers.delete(fn);
  };
}

/** Has the visitor been scrolling slowly (or not at all) for at least `ms`? */
export function calm(ms = 150) {
  const now = performance.now();
  if (now - lastT >= ms) return true; // no scroll events at all for that long
  return speed <= CALM_SPEED && calmSince > 0 && now - calmSince >= ms;
}
