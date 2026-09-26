"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DollarSign, Landmark, TicketCheck, Users, Utensils } from "lucide-react";
import { progressBetween } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

const PHOTO = "/design/land-montreal-night.jpg";
const CONCERT_PHOTO = "/design/place-concert-arena.jpg";

const CONSTRAINTS = [
  { label: "4 friends", icon: Users },
  { label: "$900 each", icon: DollarSign },
  { label: "Vegetarian", icon: Utensils },
  { label: "No museums", icon: Landmark },
] as const;

/**
 * Roam's shared context is a composed trip brief, not an orbit of metadata.
 * The concert establishes why the trip exists; each constraint then settles
 * into the same physical brief before it opens into destination discovery.
 */
export function ContextScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const briefRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const constraintRefs = useRef<(HTMLDivElement | null)[]>([]);
  const routeRef = useRef<SVGPathElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const destinationRef = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gsap.set([briefRef.current, headlineRef.current], { opacity: 0 });
      gsap.set(backdropRef.current, { opacity: 1 });
      gsap.set(photoRef.current, { opacity: 1 });
      gsap.set(overlayRef.current, { opacity: 1 });
      gsap.set(destinationRef.current, { opacity: 1 });
      return;
    }

    const update = () => {
      smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.1;
      const p = smoothedRevealRef.current;
      const briefIn = progressBetween(p, 0.04, 0.16);
      const routeDraw = progressBetween(p, 0.3, 0.54);
      const briefOut = progressBetween(p, 0.57, 0.68);
      const photoIn = progressBetween(p, 0.72, 0.86);

      gsap.set(briefRef.current, {
        opacity: briefIn * (1 - briefOut),
        y: 26 * (1 - briefIn) - 12 * briefOut,
        scale: 0.96 + briefIn * 0.04 - briefOut * 0.02,
      });
      gsap.set(anchorRef.current, {
        opacity: progressBetween(p, 0.14, 0.25) * (1 - briefOut),
        y: 16 * (1 - progressBetween(p, 0.14, 0.25)),
      });
      CONSTRAINTS.forEach((_, index) => {
        const inProgress = progressBetween(p, 0.23 + index * 0.065, 0.34 + index * 0.065);
        gsap.set(constraintRefs.current[index], {
          opacity: inProgress * (1 - briefOut),
          x: 18 * (1 - inProgress),
        });
      });
      gsap.set(routeRef.current, { strokeDashoffset: 1 - routeDraw, opacity: routeDraw * (1 - briefOut) });
      gsap.set(headlineRef.current, {
        opacity: progressBetween(p, 0.44, 0.56) * (1 - briefOut),
        x: 20 * (1 - progressBetween(p, 0.44, 0.56)),
      });
      gsap.set(backdropRef.current, { opacity: progressBetween(p, 0.66, 0.8) });
      gsap.set(photoRef.current, { opacity: photoIn });
      gsap.set(overlayRef.current, { opacity: photoIn });
      gsap.set(destinationRef.current, { opacity: progressBetween(p, 0.88, 0.97) });
    };

    gsap.ticker.add(update);
    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top top",
      end: "+=4400",
      pin: true,
      scrub: true,
      onUpdate: (self) => {
        revealRef.current = self.progress;
      },
    });

    return () => {
      gsap.ticker.remove(update);
      trigger.kill();
    };
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} data-scene="context" className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background">
      <div ref={backdropRef} className="pointer-events-none absolute inset-0 bg-[#171717] opacity-0" />
      <div ref={photoRef} className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-0" style={{ backgroundImage: `url(${PHOTO})` }} />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent opacity-0" />

      <div className="absolute inset-0 mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] md:px-12">
        <div
          ref={briefRef}
          className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.75rem] border border-border bg-surface p-5 opacity-0 shadow-lift md:mx-0"
        >
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-coral uppercase">Trip brief</p>
              <h2 className="mt-1 font-display text-3xl tracking-[-0.03em]">Montreal</h2>
              <p className="mt-1 text-sm text-muted-foreground">Oct 16-19 · Four friends</p>
            </div>
            <span className="rounded-full bg-coral-soft px-3 py-1 text-xs font-medium text-coral">Ready to shape</span>
          </div>

          <div ref={anchorRef} className="relative mt-5 overflow-hidden rounded-2xl border border-coral/25 bg-coral-soft/50 opacity-0">
            <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${CONCERT_PHOTO})` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
            <div className="absolute inset-x-4 bottom-3 flex items-center gap-2 text-white">
              <span className="grid size-7 place-items-center rounded-full bg-white/20 backdrop-blur">
                <TicketCheck className="size-4" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-xs font-medium">Bad Bunny · Oct 16</p>
                <p className="text-[11px] text-white/75">The trip anchor</p>
              </div>
            </div>
          </div>

          <div className="relative mt-4 space-y-1 pl-9">
            <svg className="pointer-events-none absolute top-1 left-2 h-[calc(100%-0.5rem)] w-5" viewBox="0 0 20 160" preserveAspectRatio="none" aria-hidden="true">
              <path ref={routeRef} d="M10 2 C2 28 18 48 10 78 S2 124 10 158" pathLength="1" fill="none" stroke="currentColor" strokeWidth="2" className="text-coral" strokeDasharray="1" strokeDashoffset="1" />
            </svg>
            {CONSTRAINTS.map(({ label, icon: Icon }, index) => (
              <div
                key={label}
                ref={(element) => {
                  constraintRefs.current[index] = element;
                }}
                className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-coral-soft text-coral">
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-center md:text-left">
          <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-coral uppercase">One shared picture</p>
          <h2 ref={headlineRef} className="font-display text-[clamp(3rem,6vw,6.5rem)] leading-[0.92] tracking-[-0.04em] opacity-0">
            Roam gets the whole trip.
          </h2>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-10 px-6 text-center">
        <h2 ref={destinationRef} className="font-display text-[clamp(2.75rem,6.5vw,6.5rem)] tracking-[-0.02em] text-white opacity-0">
          Saturday is wide open.
        </h2>
      </div>
    </section>
  );
}
