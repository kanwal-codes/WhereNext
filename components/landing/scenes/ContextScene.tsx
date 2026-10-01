"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DollarSign, Landmark, TicketCheck, Users, Utensils } from "lucide-react";
import { fadeIn, progressBetween, smoothStep, trackEntrance, trackRevisit } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

const CONCERT_PHOTO = "/design/place-concert-arena.jpg";

const CONSTRAINTS = [
  { label: "4 friends", icon: Users },
  { label: "$900 each", icon: DollarSign },
  { label: "Vegetarian", icon: Utensils },
  { label: "No museums", icon: Landmark },
] as const;

// Beat sheet, in px of pin scroll. The brief is complete as it rises into the clean canvas; the
// headline plays on its own as soon as the scene lands (time-based, not scroll-driven). The pin
// is short: hold ~800px, dissolve, and leave the last 200px empty before Discover rises in.
const EXIT = [800, 1100] as const;
const D = 1300;
// Revisiting shows the brief with its headline in.
const RESOLVED = 500;

/**
 * Roam's shared context, composed as a trip brief rather than an orbit of metadata. The concert
 * establishes why the trip exists and the constraints sit in the same brief, complete as the card
 * rises; "Roam gets the whole trip." then arrives on its own before the story opens into discovery.
 */
export function ContextScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);
  const enterRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gsap.set([briefRef.current, eyebrowRef.current, headlineRef.current], { opacity: 1 });
      return;
    }

    // The headline arrives by itself as the scene lands; a fast scroll past it jumps to the end.
    const bubbleEase = "cubic-bezier(.22, 1, .36, 1)";
    gsap.set([eyebrowRef.current, headlineRef.current], { x: 20 });
    const intro = gsap.timeline({ paused: true });
    intro.to(eyebrowRef.current, { opacity: 1, x: 0, duration: 0.8, ease: bubbleEase }, 0);
    intro.to(headlineRef.current, { opacity: 1, x: 0, duration: 0.8, ease: bubbleEase }, 0.12);

    const update = () => {
      smoothedRevealRef.current = smoothStep(smoothedRevealRef.current, revealRef.current, 0.1);
      const px = smoothedRevealRef.current * D;
      const w = (a: number, b: number) => progressBetween(px, a, b);
      const exit = w(EXIT[0], EXIT[1]);
      const briefIn = progressBetween(enterRef.current, 0, 0.6);

      gsap.set(stageRef.current, { opacity: 1 - exit });
      gsap.set(briefRef.current, { opacity: briefIn, y: 26 * (1 - briefIn), scale: 0.96 + briefIn * 0.04 });
    };

    gsap.ticker.add(update);
    const revisit = trackRevisit(RESOLVED / D, D, (target) => {
      smoothedRevealRef.current = target;
      fadeIn(sectionRef.current);
    });
    const st = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top top",
      end: `+=${D}`,
      pin: true,
      scrub: true,
      onEnter: () => intro.play(),
      onLeave: () => intro.progress(1),
      onUpdate: (self) => {
        revealRef.current = revisit(self);
      },
    });
    const entrance = trackEntrance(sectionRef.current!, (value) => {
      enterRef.current = value;
    });

    return () => {
      gsap.ticker.remove(update);
      st.kill();
      entrance.kill();
      intro.kill();
    };
  }, []);

  return (
    <div ref={sectionRef} data-scene="context" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div
        ref={stageRef}
        className="absolute inset-0 mx-auto grid max-w-6xl content-center items-center gap-6 px-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] md:gap-10 md:px-12"
      >
        <div
          ref={briefRef}
          aria-hidden="true"
          className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-surface p-5 opacity-0 shadow-lift md:mx-0 md:max-w-lg md:p-7"
        >
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-coral-ink uppercase">Trip brief</p>
              <p className="mt-1 font-display text-3xl tracking-[-0.03em]">Montreal</p>
              <p className="mt-1 text-sm text-muted-foreground">Oct 16-19 · Four friends</p>
            </div>
            <span className="rounded-full bg-coral-soft px-3 py-1 text-xs font-medium text-coral-ink">Ready to shape</span>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-2xl border border-coral/25 bg-coral-soft/50">
            <div className="h-24 bg-cover bg-center md:h-36" style={{ backgroundImage: `url(${CONCERT_PHOTO})` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute inset-x-4 bottom-3 flex items-center gap-2 text-white">
              <span className="grid size-7 place-items-center rounded-full bg-white/20 backdrop-blur">
                <TicketCheck className="size-4" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-xs font-medium">Bad Bunny · Oct 16</p>
                <p className="text-xs text-white/85">The trip anchor</p>
              </div>
            </div>
          </div>

          <div className="relative mt-4 space-y-1 pl-9">
            <svg className="pointer-events-none absolute top-1 left-2 h-[calc(100%-0.5rem)] w-5" viewBox="0 0 20 160" preserveAspectRatio="none" aria-hidden="true">
              <path d="M10 2 C2 28 18 48 10 78 S2 124 10 158" fill="none" stroke="currentColor" strokeWidth="2" className="text-coral" />
            </svg>
            {CONSTRAINTS.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-coral-soft text-coral">
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-medium md:text-base">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-center md:text-left">
          <p ref={eyebrowRef} className="mb-3 text-xs font-semibold tracking-[0.16em] text-coral-ink uppercase opacity-0">One shared picture</p>
          <h2 ref={headlineRef} className="font-display text-[clamp(2.25rem,6vw,6.5rem)] leading-[0.92] tracking-[-0.04em] opacity-0">
            Roam gets the whole trip.
          </h2>
        </div>
      </div>
    </div>
  );
}
