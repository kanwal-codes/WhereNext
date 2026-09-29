"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { fadeIn, progressBetween, smoothStep, trackRevisit } from "@/components/landing/choreography";
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
  { label: "pack a jacket", sub: "", icon: NotebookPen, origin: { x: -240, y: 140 }, rest: { top: "58%", left: "18%" }, rotation: -1, depth: 1 },
  { label: "airbnb.com/rooms/…", sub: "", icon: Link2, origin: { x: -60, y: 260 }, rest: { top: "80%", left: "30%" }, rotation: 3, depth: 1.15 },
];

// Beat sheet, in px of pin scroll. The scene opens as a quiet group chat (its bubbles arrive on
// their own, on time, as the scene scrolls in); the first 350px of scroll just hold it. Then the
// thread breaks apart, its bubbles drifting out to become the first pieces of the pile, the
// swarm fills in around them, and each headline gets a hold. The last 200px are deliberately
// empty so the section is blank before its pin releases.
const D = 3650;
// Revisiting shows this settled frame (cards in, "Roam brings it together." held).
const RESOLVED = 2800;
const CHAT_DONE = 200; // a scroll this far in jumps any unfinished chat intro to its end
const BREAK_START = 350;
const BREAK_STAGGER = 60;
const BREAK_SPAN = 600;
const SWARM_START = 650;
const SWARM_SPAN = 640; // objects reveal one after another across this stretch
const SWARM_REVEAL = 360; // each object's own arrival
const H1_IN = [1250, 1500] as const;
const H1_OUT = [1950, 2150] as const;
const H2_IN = [2150, 2400] as const;
const EXIT = [3050, 3350] as const; // the mess is pulled together, then dissolves
const H2_OUT = [3200, 3450] as const;

// The opening chat. `to` is where each bubble ends up once the thread breaks apart (centre, as a
// percentage of the section), in the gaps the cards leave.
const CHAT = [
  { who: "K", text: "ROAD TRIP???", side: "left", to: { x: 12, y: 24 }, rotation: -3 },
  { who: "A", text: "bad bunny montreal oct 16 👀", side: "right", to: { x: 85, y: 27 }, rotation: 2 },
  { who: "M", text: "i\u2019m free 16-19", side: "left", to: { x: 12, y: 45 }, rotation: 2 },
  { who: "K", text: "wait who\u2019s driving", side: "right", to: { x: 14, y: 87 }, rotation: -2 },
  { who: "A", text: "not it", side: "left", to: { x: 86, y: 88 }, rotation: 3 },
] as const;

const MICROCOPY = [
  { text: "is the hotel booked?", top: "20%", left: "44%", start: 1000, end: 1380 },
  { text: "send the link again", top: "66%", left: "56%", start: 1150, end: 1530 },
  { text: "where were we eating saturday?", top: "44%", left: "68%", start: 1330, end: 1710 },
  { text: "WHO HAS THE TICKETS", top: "26%", left: "62%", start: 1500, end: 1880 },
] as const;

/**
 * Storyboard Frame 1 + 2 — the opening chat and the chaos it turns into. One pinned scene: a
 * quiet group chat ("ROAD TRIP???"), then the thread breaks apart and its bubbles join a
 * swarm of everything else a trip is scattered across, then "Roam brings it together."
 *
 * Built as a single ScrollTrigger with a ticker driving plain `gsap.set` calls per object,
 * rather than a maze of position-based `tl.to()` calls — simpler to get right for ~20
 * independently-timed objects. The chat's arrival is the one time-based piece: a paused
 * timeline that plays as the scene scrolls into view. Each bubble has an outer wrapper (owned
 * by the scroll-driven breakup) and an inner bubble (owned by that intro), so the two never
 * fight over a transform.
 */
export function ChaosScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const objectRefs = useRef<(HTMLDivElement | null)[]>([]);
  const microcopyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headline1Ref = useRef<HTMLHeadingElement>(null);
  const headline2Ref = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const section = sectionRef.current;
    if (!section) return;

    // Where each chat bubble sits in the thread, as an offset from where it ends up.
    const deltas = CHAT.map(() => ({ x: 0, y: 0 }));
    const measure = () => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      CHAT.forEach((msg, i) => {
        const el = chatRefs.current[i];
        if (!el) return;
        deltas[i] = {
          x: (msg.to.x / 100) * w - (el.offsetLeft + el.offsetWidth / 2),
          y: (msg.to.y / 100) * h - (el.offsetTop + el.offsetHeight / 2),
        };
      });
    };

    if (reduce) {
      measure();
      chatRefs.current.forEach((el, i) => {
        if (!el) return;
        gsap.set(el, { x: 0, y: 0, rotate: CHAT[i].rotation });
        gsap.set(el.children, { opacity: 1, y: 0, scale: 1 });
      });
      objectRefs.current.forEach((el, i) => {
        if (!el) return;
        gsap.set(el, { x: 0, y: 0, opacity: 1, rotate: OBJECTS[i].rotation });
      });
      gsap.set(headline1Ref.current, { opacity: 0 });
      gsap.set(headline2Ref.current, { opacity: 1, pointerEvents: "auto" });
      microcopyRefs.current.forEach((el) => gsap.set(el, { opacity: 0 }));
      return;
    }

    const ctx = gsap.context(() => {
      measure();
      ScrollTrigger.addEventListener("refresh", measure);

      const bubbleEase = "cubic-bezier(.22, 1, .36, 1)";
      const intro = gsap.timeline({ paused: true });
      chatRefs.current.forEach((el, i) => {
        if (el) intro.to(el.children, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: bubbleEase }, 0.2 + i * 0.7);
      });
      // Plays as the scene scrolls into view (not on page load, where nobody would see it); a
      // fast scroll straight past it jumps to the end state instead of leaving a half-played chat.
      const begin = () => intro.play();
      ScrollTrigger.create({
        trigger: section,
        start: "top 75%",
        onEnter: begin,
        onLeave: () => intro.progress(1),
      });

      const update = () => {
        smoothedRevealRef.current = smoothStep(smoothedRevealRef.current, revealRef.current, 0.1);
        const px = smoothedRevealRef.current * D;
        const w = (a: number, b: number) => progressBetween(px, a, b);
        const exit = w(EXIT[0], EXIT[1]);
        if (px > CHAT_DONE && intro.progress() < 1) intro.progress(1);

        CHAT.forEach((msg, i) => {
          const el = chatRefs.current[i];
          if (!el) return;
          const start = BREAK_START + i * BREAK_STAGGER;
          const t = w(start, start + BREAK_SPAN);
          const eased = t * t * (3 - 2 * t);
          const drift = Math.max(0, px - (start + BREAK_SPAN)) * 0.0321;
          gsap.set(el, {
            x: deltas[i].x * eased + (section.clientWidth / 2 - (msg.to.x / 100) * section.clientWidth) * 0.2 * exit,
            y: deltas[i].y * eased - drift + (section.clientHeight / 2 - (msg.to.y / 100) * section.clientHeight) * 0.2 * exit,
            rotate: msg.rotation * eased,
            opacity: 1 - exit,
          });
        });

        OBJECTS.forEach((obj, i) => {
          const el = objectRefs.current[i];
          if (!el) return;
          const revealStart = SWARM_START + (i / OBJECTS.length) * SWARM_SPAN;
          const revealEnd = revealStart + SWARM_REVEAL;
          const reveal = w(revealStart, revealEnd);
          const drift = Math.max(0, px - revealEnd) * obj.depth * 0.0321;
          // "Roam brings it together" — on the way out each card is drawn a
          // little toward the middle as it dissolves.
          let pullX = 0;
          let pullY = 0;
          if (exit > 0) {
            pullX = (section.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2)) * 0.2 * exit;
            pullY = (section.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2)) * 0.2 * exit;
          }
          gsap.set(el, {
            x: obj.origin.x * (1 - reveal) + pullX,
            y: obj.origin.y * (1 - reveal) - drift + pullY,
            opacity: reveal * (1 - exit),
            rotate: obj.rotation,
            scale: 0.92 + reveal * 0.08 - exit * 0.05,
          });
        });

        MICROCOPY.forEach((copy, i) => {
          const el = microcopyRefs.current[i];
          if (!el) return;
          const mid = (copy.start + copy.end) / 2;
          const fadeIn = w(copy.start, mid);
          const fadeOut = 1 - w(mid, copy.end);
          gsap.set(el, { opacity: Math.min(fadeIn, fadeOut), y: (1 - fadeIn) * 8 });
        });

        // The overlays are pointer-events-none so they never block the cards; the text inside opts
        // back in only while visible, so each piece can be selected.
        const h1 = w(H1_IN[0], H1_IN[1]) * (1 - w(H1_OUT[0], H1_OUT[1]));
        const h2 = w(H2_IN[0], H2_IN[1]) * (1 - w(H2_OUT[0], H2_OUT[1]));
        gsap.set(headline1Ref.current, { opacity: h1, pointerEvents: h1 > 0.05 ? "auto" : "none" });
        gsap.set(headline2Ref.current, {
          opacity: h2,
          y: (1 - w(H2_IN[0], H2_IN[1])) * 16,
          pointerEvents: h2 > 0.05 ? "auto" : "none",
        });
      };

      gsap.ticker.add(update);
      const revisit = trackRevisit(RESOLVED / D, D, (target) => {
        smoothedRevealRef.current = target;
        fadeIn(sectionRef.current);
      });
      const st = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${D}`,
        pin: true,
        scrub: true,
        onUpdate: (self) => {
          revealRef.current = revisit(self);
        },
      });

      return () => {
        gsap.ticker.remove(update);
        ScrollTrigger.removeEventListener("refresh", measure);
        st.kill();
      };
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <div id="how-it-works" ref={sectionRef} data-scene="chaos" className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background">
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

      {/* The opening group chat. Rows are wrapped so the breakup can move them freely. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <div className="flex w-[min(22rem,100%)] flex-col gap-3">
          {CHAT.map((msg, i) => (
            <div
              key={msg.text}
              ref={(el) => {
                chatRefs.current[i] = el;
              }}
              className={`pointer-events-auto flex items-end gap-2 ${msg.side === "right" ? "flex-row-reverse self-end" : "self-start"}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-background bg-primary text-[11px] font-semibold text-primary-foreground opacity-0">
                {msg.who}
              </span>
              <div
                className={`max-w-[16rem] translate-y-6 scale-[0.96] rounded-2xl border px-4 py-3 text-sm opacity-0 shadow-lift ${msg.side === "right" ? "rounded-br-md border-primary bg-primary text-primary-foreground" : "rounded-bl-md border-border bg-surface"}`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
        <h2 ref={headline1Ref} className="absolute text-center font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.02] tracking-[-0.03em] opacity-0">
          Planning gets messy.
        </h2>
        <h2 ref={headline2Ref} className="absolute text-center font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[1.02] tracking-[-0.03em] opacity-0">
          <span className="text-coral">Roam</span> brings it together.
        </h2>
      </div>
    </div>
  );
}
