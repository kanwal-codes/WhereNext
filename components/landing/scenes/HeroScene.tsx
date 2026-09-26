"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const AVATARS = ["K", "A", "M"] as const;

/**
 * Storyboard Frame 1 — Hero. Two independent GSAP pieces, per the entrance
 * sequence in Design_Language §4 and Narrative_Script #01:
 *
 * 1. A time-based intro timeline (headline, then message bubbles, then
 *    avatars, then Roam's reply) that plays once on mount. Spike 4
 *    (Build_Plan step 2) proved the right behavior if the visitor scrolls
 *    before it finishes: jump straight to the end state, never lock scroll.
 * 2. A scroll-scrubbed exit (headline scale 1 → 0.92 + move up, messages
 *    drifting at slightly different rates — "the first parallax moment")
 *    once the visitor actually starts scrolling past the hero.
 */
export function HeroScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const msg1Ref = useRef<HTMLDivElement>(null);
  const msg2Ref = useRef<HTMLDivElement>(null);
  const avatarsRef = useRef<HTMLDivElement>(null);
  const msg3Ref = useRef<HTMLDivElement>(null);
  const roamRef = useRef<HTMLDivElement>(null);
  // Mouse-parallax wrappers (Design_Language §32) — separate DOM nodes from
  // the refs above, which GSAP's intro/exit timelines already own. Reusing
  // the same elements for both would mean two independent mechanisms
  // fighting over the same x/y transform; a distinct outer wrapper per
  // bubble means neither timeline's code has to change at all.
  const msg1WrapRef = useRef<HTMLDivElement>(null);
  const msg2WrapRef = useRef<HTMLDivElement>(null);
  const avatarsWrapRef = useRef<HTMLDivElement>(null);
  const msg3WrapRef = useRef<HTMLDivElement>(null);
  const roamWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set([headlineRef.current, msg1Ref.current, msg2Ref.current, avatarsRef.current, msg3Ref.current, roamRef.current], {
          opacity: 1,
          y: 0,
          scale: 1,
        });
        return;
      }

      const bubbleEase = "cubic-bezier(.22, 1, .36, 1)";
      const intro = gsap.timeline();
      intro.to(headlineRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: bubbleEase }, 0.35);
      intro.to(msg1Ref.current, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: bubbleEase }, 0.85);
      intro.to(msg2Ref.current, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: bubbleEase }, 1.1);
      intro.to(avatarsRef.current!.children, { opacity: 1, y: 0, duration: 0.35, ease: bubbleEase, stagger: 0.07 }, 1.35);
      intro.to(msg3Ref.current, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: bubbleEase }, 1.55);
      intro.to(roamRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: bubbleEase }, 1.85);

      // Spike 4 (Build_Plan step 2): an early scroll/wheel/touch input jumps
      // the intro straight to its end state instead of fighting the visitor.
      const skipAhead = () => {
        if (intro.progress() < 1) intro.progress(1);
        window.removeEventListener("wheel", skipAhead);
        window.removeEventListener("touchmove", skipAhead);
      };
      window.addEventListener("wheel", skipAhead, { passive: true });
      window.addEventListener("touchmove", skipAhead, { passive: true });

      // Mouse parallax (Design_Language §32) — modest per-bubble offsets,
      // smoothed via GSAP's quickTo (built for exactly this: rapid repeated
      // calls without stacking tweens) rather than React state, since a
      // mousemove-driven state update would re-render on every pixel of
      // cursor movement. Stops once the visitor actually scrolls, per spec.
      const wraps: { el: HTMLDivElement | null; mag: number }[] = [
        { el: msg1WrapRef.current, mag: 8 },
        { el: msg2WrapRef.current, mag: 10 },
        { el: avatarsWrapRef.current, mag: 6 },
        { el: msg3WrapRef.current, mag: 7 },
        { el: roamWrapRef.current, mag: 9 },
      ];
      const setters = wraps
        .filter((w): w is { el: HTMLDivElement; mag: number } => !!w.el)
        .map((w) => ({
          x: gsap.quickTo(w.el, "x", { duration: 0.3, ease: "power3" }),
          y: gsap.quickTo(w.el, "y", { duration: 0.3, ease: "power3" }),
          mag: w.mag,
        }));
      const onMouseMove = (e: MouseEvent) => {
        if (window.scrollY > 10) return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        setters.forEach((s) => {
          s.x(nx * s.mag);
          s.y(ny * s.mag);
        });
      };
      window.addEventListener("mousemove", onMouseMove);

      // The scroll-driven exit: headline scales down and lifts, messages
      // drift upward at slightly different rates (first parallax moment).
      const exitTl = gsap.timeline({
        scrollTrigger: { trigger: sectionRef.current, start: "top top", end: "+=550", scrub: true },
      });
      exitTl.to(headlineRef.current, { scale: 0.92, y: -100, ease: "none" }, 0);
      exitTl.to(msg1Ref.current, { y: -60, ease: "none" }, 0);
      exitTl.to(msg2Ref.current, { y: -140, ease: "none" }, 0);
      exitTl.to([avatarsRef.current, msg3Ref.current], { y: -90, ease: "none" }, 0);
      exitTl.to(roamRef.current, { y: -170, ease: "none" }, 0);

      return () => {
        window.removeEventListener("wheel", skipAhead);
        window.removeEventListener("touchmove", skipAhead);
        window.removeEventListener("mousemove", onMouseMove);
      };
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} data-scene="hero" className="relative min-h-[calc(100dvh+550px)] bg-background">
      <div className="sticky top-0 flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden="true">
          <path d="M -50 400 C 300 250, 700 550, 1500 300" stroke="var(--foreground)" strokeWidth={1.5} fill="none" />
        </svg>

        <h1
          ref={headlineRef}
          className="translate-y-8 scale-[0.98] text-center font-display text-[clamp(3.5rem,15vw,10rem)] leading-[0.92] tracking-[-0.04em] opacity-0"
        >
          we should go.
        </h1>
        <p className="mt-6 max-w-xl text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
          Where Next turns your trip chat into one shared itinerary, then keeps it updated when plans change.
        </p>
        <div className="mt-8 flex items-center gap-5">
          <Link href="/sign-up" className="btn-primary">
            Start a trip
          </Link>
          <Link href="#how-it-works" className="link-underline text-sm font-medium text-foreground">
            See how it works
          </Link>
        </div>

        <div className="pointer-events-none absolute inset-0">
          <div ref={msg1WrapRef} className="absolute right-[8%] bottom-[30%] max-md:top-[66%] max-md:right-6 max-md:bottom-auto">
            <div
              ref={msg1Ref}
              className="max-w-[16rem] translate-y-6 scale-[0.96] rounded-2xl rounded-br-md border border-border bg-surface px-4 py-3 text-sm opacity-0 shadow-lift"
            >
              bad bunny montreal oct 16 👀
            </div>
          </div>
          <div ref={msg2WrapRef} className="absolute bottom-[42%] left-[8%] max-md:top-[27%] max-md:bottom-auto max-md:left-6">
            <div
              ref={msg2Ref}
              className="max-w-[14rem] translate-y-6 scale-[0.96] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm opacity-0 shadow-lift"
            >
              ROAD TRIP???
            </div>
          </div>
          <div ref={avatarsWrapRef} className="absolute top-[23%] left-[16%] max-md:top-[18%] max-md:left-6">
            <div ref={avatarsRef} className="flex -space-x-2">
              {AVATARS.map((initial) => (
                <span
                  key={initial}
                  className="grid size-8 -translate-y-3 place-items-center rounded-full border-2 border-background bg-primary text-[11px] font-semibold text-primary-foreground opacity-0"
                >
                  {initial}
                </span>
              ))}
            </div>
          </div>
          <div ref={msg3WrapRef} className="absolute bottom-[20%] left-[10%] max-md:top-[75%] max-md:bottom-auto max-md:left-10">
            <div
              ref={msg3Ref}
              className="max-w-[14rem] translate-y-6 scale-[0.96] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm opacity-0 shadow-lift"
            >
              i&rsquo;m free 16-19
            </div>
          </div>
          <div ref={roamWrapRef} className="absolute right-[10%] bottom-[14%] max-md:top-[83%] max-md:right-6 max-md:bottom-auto">
            <div
              ref={roamRef}
              className="max-w-[17rem] translate-y-6 scale-[0.96] rounded-2xl rounded-br-md bg-coral px-4 py-3 text-sm text-white opacity-0 shadow-lift"
            >
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-white/70 uppercase">✦ Roam</p>
              Looks like Oct 16-19 works for everyone.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
