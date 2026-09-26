"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BrandMark } from "@/components/BrandMark";
import { progressBetween } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

const FOOTER_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Discover", href: "#discover" },
  { label: "Groups", href: "#groups" },
  { label: "Sign in", href: "/sign-in" },
] as const;

/**
 * Storyboard Frame 12 — Finale, plus the (unanimated) footer. Design_Language
 * §44's "Hero motion: none — deliberate, complete stillness" is the whole
 * point here: every beat is a plain sequential fade, nothing scales, zooms,
 * or pulls the camera — the contrast with the ~90-120s of motion before it
 * is what's supposed to land, not one more flourish.
 *
 * Beats, all on one continuous progress value: the previous scene's dark
 * cinematic photography fades to warm off-white → holds blank (the "for
 * about 300px, almost blank" beat) → "Three weeks earlier..." → the original
 * hero bubble returns → "we should go." → huge, alone: "You should go." →
 * logo + CTA. The nav (a separate, always-mounted component) is reached
 * directly by DOM query rather than threaded through props/context — it's
 * the one thing outside this component's own tree the storyboard calls for
 * ("the navbar disappears too, briefly"), and there's exactly one <header>
 * on this route.
 */
export function FinaleScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const timeAgoRef = useRef<HTMLParagraphElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const weShouldRef = useRef<HTMLParagraphElement>(null);
  const payoffRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = document.querySelector("header");

    if (reduce) {
      gsap.set(backdropRef.current, { opacity: 0 });
      gsap.set([timeAgoRef.current, bubbleRef.current, weShouldRef.current], { opacity: 0 });
      gsap.set(payoffRef.current, { opacity: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      // This scene is five sequential text beats crammed into a short pin —
      // real-scroll testing (an actual mouse-wheel scroll, not a jump to a
      // calculated scrollY) showed two ordinary scrolls were enough to land
      // mid-crossfade between non-adjacent beats, with two or three of them
      // simultaneously semi-visible at once ("we should go." ghosted under
      // "You should go." and the payoff). Same two-part fix as Context's
      // dive: lerp the reveal value so scroll jitter doesn't snap straight
      // into every threshold, and give the sequence enough physical scroll
      // distance that a normal scroll doesn't skip past a beat's hold.
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.12;
        const p = smoothedRevealRef.current;

        gsap.set(backdropRef.current, { opacity: 1 - progressBetween(p, 0, 0.08) });
        // Every scene's ticker keeps running forever once mounted (there's
        // no unmount on this one-page site), so with no guard this fires on
        // literally every frame from initial page load — forcing nav back
        // to opacity 1 the entire time p sits at its 0 rest state, which is
        // the whole page until you actually scroll here. Since this
        // component mounts after CinematicTravelScene, its ticker callback
        // always runs later in the same tick, so that unconditional reset
        // permanently overwrote CinematicTravelScene's own nav-hide
        // (onEnter's gsap.to) — nav never actually stayed hidden through
        // the photography sequence. Only touching nav once p has actually
        // started moving leaves CinematicTravelScene in sole control until
        // we're really here.
        if (nav && p > 0) gsap.set(nav, { opacity: 1 - progressBetween(p, 0.03, 0.1) * (1 - progressBetween(p, 0.88, 0.96)) });

        gsap.set(timeAgoRef.current, { opacity: progressBetween(p, 0.3, 0.4) * (1 - progressBetween(p, 0.48, 0.55)) });
        gsap.set(bubbleRef.current, { opacity: progressBetween(p, 0.48, 0.56) * (1 - progressBetween(p, 0.62, 0.68)) });
        gsap.set(weShouldRef.current, { opacity: progressBetween(p, 0.6, 0.68) * (1 - progressBetween(p, 0.74, 0.8)) });
        gsap.set(payoffRef.current, {
          opacity: progressBetween(p, 0.76, 0.86),
          scale: 0.96 + progressBetween(p, 0.76, 0.9) * 0.04,
        });
      };

      gsap.ticker.add(update);

      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        // 1500 disappeared in ~2 ordinary wheel scrolls — nowhere near
        // enough room for five sequential beats to each get a real hold.
        end: "+=3400",
        pin: true,
        scrub: true,
        onUpdate: (self) => {
          revealRef.current = self.progress;
        },
      });

      return () => {
        gsap.ticker.remove(update);
        st.kill();
      };
    }, sectionRef);

    return () => {
      ctx.revert();
      if (nav) gsap.set(nav, { opacity: 1 });
    };
  }, []);

  return (
    <>
      <div ref={sectionRef} data-scene="finale" className="relative min-h-[100dvh] overflow-hidden bg-background">
        <div ref={backdropRef} className="pointer-events-none absolute inset-0 bg-[#171717]" />

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p ref={timeAgoRef} className="absolute text-xs tracking-[0.25em] text-muted-foreground uppercase opacity-0">
            Three weeks earlier
          </p>

          <div
            ref={bubbleRef}
            className="absolute max-w-[16rem] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm opacity-0 shadow-lift"
          >
            bad bunny montreal oct 16 👀
          </div>

          <p ref={weShouldRef} className="absolute font-display text-[clamp(2rem,5vw,3rem)] tracking-[-0.02em] opacity-0">
            we should go.
          </p>

          <div ref={payoffRef} className="absolute flex flex-col items-center gap-8 opacity-0">
            <h2 className="font-display text-[clamp(3.5rem,10vw,7rem)] leading-[0.95] tracking-[-0.03em]">You should go.</h2>
            <BrandMark variant="text" textClassName="text-lg" />
            <Link href="/sign-up" className="btn-primary pointer-events-auto">
              Start a trip
            </Link>
          </div>
        </div>
      </div>

      <footer className="bg-background px-8 py-16 text-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-12">
          <div>
            <BrandMark variant="text" textClassName="text-xl" />
            <p className="mt-2 text-muted-foreground">Go somewhere.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="link-underline text-sm text-muted-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Where Next</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
