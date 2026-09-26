"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { progressBetween } from "@/components/landing/choreography";
import {
  BedDouble,
  CloudSun,
  Compass,
  DollarSign,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  NotebookPen,
  Plane,
  Route,
  TicketCheck,
  Utensils,
  type LucideIcon,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type ChaosObject = {
  label: string;
  sub: string;
  icon?: LucideIcon;
  photo?: string;
  origin: { x: number; y: number };
  rest: { top: string; left?: string; right?: string };
  rotation: number;
  depth: number; // 0.8 (background) .. 1.15 (foreground) — Design_Language §29
};

// Max ~15-18 scattered objects (Design_Language §5), arriving from all four
// sides rather than only the bottom.
const OBJECTS: ChaosObject[] = [
  { label: "Fairmont Le Château", sub: "$220/night", icon: BedDouble, origin: { x: -220, y: -160 }, rest: { top: "10%", left: "6%" }, rotation: -2, depth: 1 },
  { label: "Olive et Gourmando", sub: "4.8 ★ · Old Montreal", icon: Utensils, origin: { x: -260, y: 40 }, rest: { top: "30%", left: "3%" }, rotation: 3, depth: 1.15 },
  // Was "Fri 3:45 PM" — CinematicTravelScene shows this same booking's
  // actual departure at 8:32 AM Friday (its own "8:17 AM · leaves in 15
  // minutes" beat), not this ticket's stated time. Two different times for
  // one booking read as a continuity error, not two options being weighed.
  { label: "VIA Rail · YTO→YUL", sub: "Fri 8:32 AM", icon: Route, origin: { x: 0, y: -220 }, rest: { top: "6%", left: "36%" }, rotation: -1, depth: 0.8 },
  { label: "Bad Bunny · Bell Centre", sub: "Oct 16 · 8 PM", icon: TicketCheck, origin: { x: 240, y: -120 }, rest: { top: "12%", right: "8%" }, rotation: 2, depth: 1.15 },
  { label: "18°C Saturday", sub: "Partly cloudy", icon: CloudSun, origin: { x: 260, y: 60 }, rest: { top: "34%", right: "5%" }, rotation: -3, depth: 0.8 },
  { label: "Old Montreal", sub: "12 min walk", icon: MapPin, origin: { x: -240, y: 220 }, rest: { top: "62%", left: "7%" }, rotation: 1, depth: 1 },
  { label: "10 things to do in MTL", sub: "2.3M views", icon: Music, origin: { x: -280, y: -20 }, rest: { top: "48%", left: "1%" }, rotation: -2, depth: 1.15 },
  { label: "Your reservation is confirmed", sub: "Olive et Gourmando", icon: Mail, origin: { x: 40, y: -240 }, rest: { top: "4%", left: "58%" }, rotation: 2, depth: 0.8 },
  { label: "what hotel?", sub: "", icon: MessageCircle, origin: { x: 0, y: 240 }, rest: { top: "74%", left: "42%" }, rotation: -1, depth: 1 },
  { label: "Old Port walking tour", sub: "$0 · 2 hrs", icon: Compass, origin: { x: 260, y: 140 }, rest: { top: "54%", right: "4%" }, rotation: 3, depth: 1 },
  { label: "$900 budget", sub: "per person", icon: DollarSign, origin: { x: 240, y: 240 }, rest: { top: "70%", right: "9%" }, rotation: -2, depth: 0.8 },
  { label: "Cobblestone streets", sub: "", photo: "/design/place-neighbourhood.jpg", origin: { x: -220, y: -260 }, rest: { top: "16%", left: "20%" }, rotation: -3, depth: 1.15 },
  { label: "Where we're staying", sub: "", photo: "/design/place-hotel.jpg", origin: { x: 0, y: 260 }, rest: { top: "78%", left: "62%" }, rotation: 2, depth: 1 },
  { label: "Porter · YTZ→YUL", sub: "$146", icon: Plane, origin: { x: 280, y: -40 }, rest: { top: "40%", right: "1%" }, rotation: 1, depth: 0.8 },
  { label: "pack sunscreen", sub: "", icon: NotebookPen, origin: { x: -240, y: 140 }, rest: { top: "58%", left: "18%" }, rotation: -1, depth: 1 },
  { label: "airbnb.com/rooms/…", sub: "", icon: Link2, origin: { x: -60, y: 260 }, rest: { top: "80%", left: "30%" }, rotation: 3, depth: 1.15 },
];

const MICROCOPY = [
  { text: "what hotel?", top: "20%", left: "44%", start: 0.28, end: 0.42 },
  { text: "send the link again", top: "66%", left: "56%", start: 0.36, end: 0.5 },
  { text: "where were we eating saturday?", top: "44%", left: "68%", start: 0.44, end: 0.58 },
  { text: "WHO HAS THE TICKETS", top: "26%", left: "62%", start: 0.5, end: 0.64 },
] as const;

/**
 * Storyboard Frame 2 — Chaos. The first major camera zoom-out: the hero
 * (represented here by a shrinking echo card, since the real hero content
 * belongs to HeroScene) turns out to be one small piece of a much bigger,
 * scattered mess, then everything freezes on "Roam brings them together."
 *
 * Built as a single ScrollTrigger with onUpdate driving plain `gsap.set`
 * calls per object, rather than a maze of position-based `tl.to()` calls —
 * simpler to get right for ~16 independently-timed objects (see
 * MaskTransitionSpike for why implicit tween positions are easy to misread).
 */
export function ChaosScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const objectRefs = useRef<(HTMLDivElement | null)[]>([]);
  const microcopyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headline1Ref = useRef<HTMLHeadingElement>(null);
  const headline2Ref = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gsap.set(centerRef.current, { scale: 0.78 });
      objectRefs.current.forEach((el, i) => {
        if (!el) return;
        gsap.set(el, { x: 0, y: 0, opacity: 1, rotate: OBJECTS[i].rotation });
      });
      gsap.set(headline1Ref.current, { opacity: 0 });
      gsap.set(headline2Ref.current, { opacity: 1 });
      microcopyRefs.current.forEach((el) => gsap.set(el, { opacity: 0 }));
      return;
    }

    const ctx = gsap.context(() => {
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.1;
        const p = smoothedRevealRef.current;

        gsap.set(centerRef.current, {
          scale: 1 - progressBetween(p, 0, 0.45) * 0.24,
          opacity: 1 - progressBetween(p, 0.26, 0.36),
        });

        OBJECTS.forEach((obj, i) => {
          const el = objectRefs.current[i];
          if (!el) return;
          const revealStart = 0.05 + (i / OBJECTS.length) * 0.3;
          const revealEnd = revealStart + 0.15;
          const reveal = progressBetween(p, revealStart, revealEnd);
          const drift = Math.max(0, p - revealEnd) * obj.depth * 90;
          gsap.set(el, {
            x: obj.origin.x * (1 - reveal),
            y: obj.origin.y * (1 - reveal) - drift,
            opacity: reveal,
            rotate: obj.rotation,
            scale: 0.92 + reveal * 0.08,
          });
        });

        MICROCOPY.forEach((copy, i) => {
          const el = microcopyRefs.current[i];
          if (!el) return;
          const mid = (copy.start + copy.end) / 2;
          const fadeIn = progressBetween(p, copy.start, mid);
          const fadeOut = 1 - progressBetween(p, mid, copy.end);
          gsap.set(el, { opacity: Math.min(fadeIn, fadeOut), y: (1 - fadeIn) * 8 });
        });

        gsap.set(headline1Ref.current, { opacity: progressBetween(p, 0.32, 0.42) * (1 - progressBetween(p, 0.5, 0.58)) });
        gsap.set(headline2Ref.current, { opacity: progressBetween(p, 0.55, 0.63), y: (1 - progressBetween(p, 0.55, 0.63)) * 16 });
      };

      gsap.ticker.add(update);
      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=2800",
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

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} data-scene="chaos" className="relative min-h-[100dvh] overflow-hidden bg-background">
      {OBJECTS.map((obj, i) => {
        const Icon = obj.icon;
        return (
          <div
            key={obj.label}
            ref={(el) => {
              objectRefs.current[i] = el;
            }}
            className="absolute w-44 rounded-xl border border-border bg-surface p-3 opacity-0 shadow-lift"
            style={{ top: obj.rest.top, left: obj.rest.left, right: obj.rest.right }}
          >
            {obj.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- decorative placeholder thumbnail
              <img src={obj.photo} alt="" width={320} height={128} loading="lazy" className="mb-2 h-16 w-full rounded-lg object-cover" />
            ) : (
              Icon && (
                <span className="mb-2 grid size-7 place-items-center rounded-lg bg-coral-soft text-coral">
                  <Icon className="size-3.5" strokeWidth={1.8} />
                </span>
              )
            )}
            <p className="truncate text-xs font-medium">{obj.label}</p>
            {obj.sub && <p className="truncate text-[11px] text-muted-foreground">{obj.sub}</p>}
          </div>
        );
      })}

      {MICROCOPY.map((copy, i) => (
        <div
          key={copy.text}
          ref={(el) => {
            microcopyRefs.current[i] = el;
          }}
          className="absolute max-w-[12rem] rounded-full border border-border bg-surface px-3 py-1.5 text-xs opacity-0 shadow-soft"
          style={{ top: copy.top, left: copy.left }}
        >
          {copy.text}
        </div>
      ))}

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div ref={centerRef} className="rounded-2xl border border-border bg-surface px-6 py-4 text-center shadow-lift">
          <div className="flex -space-x-2 justify-center">
            {["K", "A", "M"].map((initial) => (
              <span key={initial} className="grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground">
                {initial}
              </span>
            ))}
          </div>
          <p className="mt-2 font-display text-sm">Montreal weekend?</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
        <h2 ref={headline1Ref} className="absolute text-center font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.02] tracking-[-0.03em] opacity-0">
          Trips start everywhere.
        </h2>
        <h2 ref={headline2Ref} className="absolute text-center font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.02] tracking-[-0.03em] opacity-0">
          Roam brings them together.
        </h2>
      </div>
    </div>
  );
}
