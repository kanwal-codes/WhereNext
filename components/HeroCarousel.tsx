"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { HERO_SCENES } from "@/lib/hero-scenes";
import { cn } from "@/lib/utils";

/** How long a photograph is held before the next one dissolves in. */
const HOLD_MS = 7000;
/** How long the first photograph has the connection to itself before the next one is fetched. */
const ARM_MS = 2500;

/** Each photograph at three widths (see scripts/resize-hero-scenes.ts) — the browser takes the
 *  smallest that covers the band, which on a laptop or a half-width window is not the master. */
const srcSetFor = (src: string) => {
  const base = src.replace(/\.webp$/, "");
  return `${base}-900.webp 900w, ${base}-1300.webp 1300w, ${src} 1600w`;
};
// What the band actually draws, which is not its width: `object-cover` on a 480px-tall strip scales a
// 16:9 photograph to about 854px across before a phone's 390px viewport ever enters into it. Above that
// breakpoint the band is wider than it is tall, so its width is the measure again.
const SIZES = "(max-width: 767px) 860px, 100vw";

/**
 * The trips home hero: a slow cinematic carousel of places, activities and cities. Each photograph
 * pushes in gently, dissolves into the next, and carries its caption; the set is the same for every
 * account. Only the current photograph, the one fading out and the next are mounted, so the carousel
 * costs at most three images, not the whole set — the first alone on a cold load, the next after
 * `ARM_MS` — and each is offered at three widths, so those are the ones the screen needs. It pauses while the tab is hidden and holds still under reduced motion.
 */
export function HeroCarousel({ className, children }: { className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const n = HERO_SCENES.length;
  // `prev` is the photograph still fading out; it is null until there is one, so the first paint does not fetch the last scene.
  const [{ index, prev }, setPos] = useState<{ index: number; prev: number | null }>({ index: 0, prev: null });
  const advance = () => setPos((p) => ({ index: (p.index + 1) % n, prev: p.index }));
  // The next photograph waits until the first has had the network to itself: mounted straight away, three
  // photographs share the connection and the one that is the largest contentful paint arrives last.
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(true);
  // Held while a hand is on the timeline; a resume starts the photograph's hold again, bar and timer together.
  const [paused, setPaused] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const hold = () => setPaused(true);
  const release = () => { setPaused(false); setEpoch((e) => e + 1); };

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (reduce || !visible || paused) return;
    const timer = setTimeout(() => setPos((p) => ({ index: (p.index + 1) % n, prev: p.index })), HOLD_MS);
    return () => clearTimeout(timer);
  }, [index, reduce, visible, paused, n]);

  const scene = HERO_SCENES[index]!;
  // The current photograph, the one still fading out, and (once the first has loaded) the one after it, loading in the dark.
  const mounted = new Set<number>([index]);
  if (prev !== null) mounted.add(prev);
  if (armed) mounted.add((index + 1) % n);

  return (
    <div className={cn("relative isolate overflow-hidden bg-[oklch(0.2_0.012_65)]", className)}>
      {HERO_SCENES.map((s, i) =>
        mounted.has(i) ? (
          // eslint-disable-next-line @next/next/no-img-element -- full-bleed hero; sources are curated static files
          <img
            key={s.src}
            src={s.src}
            srcSet={srcSetFor(s.src)}
            sizes={SIZES}
            alt={i === index ? s.alt : ""}
            aria-hidden={i !== index}
            fetchPriority={i === index && prev === null ? "high" : "low"}
            decoding="async"
            style={{ "--focus": s.focus ?? "50% 50%", "--focus-sm": s.focusSm ?? s.focus ?? "50% 50%" } as React.CSSProperties}
            className={cn(
              "absolute inset-0 -z-10 h-full w-full object-cover [object-position:var(--focus-sm)] sm:[object-position:var(--focus)]",
              "transition-opacity duration-[1600ms] ease-in-out",
              !reduce && "hero-kenburns",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null,
      )}

      {/* The grade: shade for the header above and the words below, and a quiet pool behind the headline. */}
      <div aria-hidden style={{ "--scrim": 0.95 * (scene.shade ?? 1) } as React.CSSProperties} className="scrim-v pointer-events-none absolute inset-0 -z-[5] transition-[--scrim] duration-[1600ms]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-[5] bg-[radial-gradient(70%_60%_at_50%_55%,oklch(0.14_0.012_60/0.42),transparent)]" />

      {children}

      {/* The place, and one hairline that fills over the hold. Press the line for the next photograph. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <p aria-live="off" className="eyebrow min-w-0 truncate !text-white/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]" key={scene.place}>
          <span className="hero-caption">{scene.place}</span>
        </p>
        <button
          type="button"
          aria-label="Next photograph"
          onClick={advance}
          onMouseEnter={hold}
          onMouseLeave={release}
          onFocus={hold}
          onBlur={release}
          className="group pointer-events-auto -mr-2 grid h-8 shrink-0 place-items-center px-2 max-sm:hidden"
        >
          <span className="relative block h-[2px] w-16 overflow-hidden rounded-full bg-white/35 shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors group-hover:bg-white/55">
            <span key={`${index}-${epoch}`} className={cn("absolute inset-0 origin-left rounded-full bg-white", reduce ? "" : "hero-progress")} style={paused ? { animationPlayState: "paused" } : undefined} />
          </span>
        </button>
      </div>
    </div>
  );
}
