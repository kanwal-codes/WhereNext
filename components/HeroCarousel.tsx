"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { HERO_SCENES } from "@/lib/hero-scenes";
import { cn } from "@/lib/utils";

/** How long a photograph is held before the next one dissolves in. */
const HOLD_MS = 7000;

/**
 * The trips home hero: a slow cinematic carousel of places, activities and cities. Each photograph
 * pushes in gently, dissolves into the next, and carries its caption; the set is the same for every
 * account. Only the current photograph and its neighbours are mounted, so the carousel costs three
 * images, not the whole set. It pauses while the tab is hidden and holds still under reduced motion.
 */
export function HeroCarousel({ className, children }: { className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const n = HERO_SCENES.length;
  const [index, setIndex] = useState(0);
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
    if (reduce || !visible || paused) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % n), HOLD_MS);
    return () => clearTimeout(timer);
  }, [index, reduce, visible, paused, n]);

  const scene = HERO_SCENES[index]!;
  // The current photograph, the one before (still fading out) and the one after (loading in the dark).
  const mounted = new Set([(index + n - 1) % n, index, (index + 1) % n]);

  return (
    <div className={cn("relative isolate overflow-hidden bg-[oklch(0.2_0.012_65)]", className)}>
      {HERO_SCENES.map((s, i) =>
        mounted.has(i) ? (
          // eslint-disable-next-line @next/next/no-img-element -- full-bleed hero; sources are curated static files
          <img
            key={s.src}
            src={s.src}
            alt={i === index ? s.alt : ""}
            aria-hidden={i !== index}
            width={1600}
            height={700}
            fetchPriority={i === 0 ? "high" : "auto"}
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
          onClick={() => setIndex((i) => (i + 1) % n)}
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
