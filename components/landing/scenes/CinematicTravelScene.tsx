"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { fadeIn, progressBetween, smoothStep, trackEntrance, trackRevisit } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

type Moment = {
  time: string;
  location: string;
  message: string;
  card: { label: string; sub: string };
  photo: string;
};

// Every photo here was wrong for what it claimed to show — a hazy
// Mediterranean rooftop for Toronto, the same Mediterranean street reused
// from Context for "Welcome to Montreal", and a dinner-party photo for a
// concert departure. Real, purpose-fit photography per moment now (the
// concert shot reuses Discover's arena photo — same energy, no reason to
// source a second one).
const MOMENTS: Moment[] = [
  { time: "8:17 AM", location: "Toronto", message: "Your train leaves in 15 minutes.", card: { label: "VIA Rail · YTO → YUL", sub: "Ticket" }, photo: "/design/place-union-station.jpg" },
  { time: "2:06 PM", location: "Montreal", message: "Welcome to Montreal.", card: { label: "Fairmont Le Château", sub: "Check-in ready" }, photo: "/design/place-hotel-lobby.jpg" },
  { time: "6:42 PM", location: "Bell Centre", message: "Leave in 18 minutes.", card: { label: "Bad Bunny · Bell Centre", sub: "Concert ticket" }, photo: "/design/place-concert-arena.jpg" },
  // Reservation was "7:30", three hours before this moment's own 10:18 PM —
  // fixed to agree with the beat it's actually attached to.
  { time: "10:18 PM", location: "Old Montreal", message: "Dinner · 8 minute walk.", card: { label: "Bistro Saint-Paul · 10:30", sub: "Reservation" }, photo: "/design/place-rooftop-lounge.jpg" },
];

// Beat sheet, in px of pin scroll. "FRIDAY" is already on screen while the dark
// section rises, holds through the start of the pin, then hands off to the
// four beats; each beat crossfades into the next (two photos briefly visible
// together, never a hard cut to black) and holds ~450px fully in. The last
// beat holds ~535px, then the whole scene dissolves into the Finale's canvas
// so the section is empty (last 200px) before its pin releases.
const INTRO = 850;
const BEAT = 720;
const CROSS = 135;
const D = 4230;
const RESOLVED = 3350; // revisiting shows the dinner beat, held
const FRIDAY_OUT = [520, 760] as const;
const EXIT = [3680, 4030] as const;
const NAV_BACK = 3880; // nav returns once the scene is mostly dissolved

/**
 * Storyboard Frame 11 — Cinematic travel. Third and last of the page's three
 * major camera moves (Design_Language §44): the calm product UI gives way
 * entirely to full-bleed photography, one beat per real Friday moment, each
 * pairing a ticket/confirmation with the reason Roam surfaced it right then.
 * Crossfade + tiny scale between beats (never a slide), per Build_Plan's
 * proven photography-transition approach; one continuous 1 -> 1.04 scale
 * runs under the whole scene rather than restarting per beat, so nothing
 * ever visibly "resets."
 */
export function CinematicTravelScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const photoWrapRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dayHeadlineRef = useRef<HTMLDivElement>(null);
  const photoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);
  const enterRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const last = MOMENTS.length - 1;
    const nav = document.querySelector("header");

    if (reduce) {
      gsap.set(backdropRef.current, { opacity: 1 });
      gsap.set(dayHeadlineRef.current, { opacity: 0 });
      MOMENTS.forEach((_, i) => {
        gsap.set(photoRefs.current[i], { opacity: i === last ? 1 : 0 });
        gsap.set(textRefs.current[i], { opacity: i === last ? 1 : 0 });
        gsap.set(cardRefs.current[i], { opacity: i === last ? 1 : 0, y: 0 });
      });
      return;
    }

    const ctx = gsap.context(() => {
      const update = () => {
        smoothedRevealRef.current = smoothStep(smoothedRevealRef.current, revealRef.current, 0.08);
        const p = smoothedRevealRef.current;
        const px = p * D;
        const w = (a: number, b: number) => progressBetween(px, a, b);
        const exit = w(EXIT[0], EXIT[1]);
        const stay = 1 - exit;

        gsap.set(backdropRef.current, { opacity: stay });
        gsap.set(dayHeadlineRef.current, { opacity: enterRef.current * (1 - w(FRIDAY_OUT[0], FRIDAY_OUT[1])) });
        gsap.set(photoWrapRef.current, { scale: 1 + p * 0.04, opacity: stay });

        MOMENTS.forEach((_, i) => {
          const start = INTRO + i * BEAT;
          const end = start + BEAT;
          const fadeIn = w(start - CROSS, start + CROSS);
          const fadeOut = i === last ? 1 : 1 - w(end - CROSS, end + CROSS);
          const opacity = fadeIn * fadeOut * stay;

          gsap.set(photoRefs.current[i], { opacity: fadeIn * fadeOut });
          gsap.set(textRefs.current[i], { opacity, y: (1 - fadeIn) * 14 });
          gsap.set(cardRefs.current[i], { opacity, y: 24 * (1 - w(start, start + BEAT * 0.25)) });
        });
      };

      gsap.ticker.add(update);
      let navShown = true;
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
        onUpdate: (self) => {
          revealRef.current = revisit(self);
          if (!nav) return;
          const show = self.progress === 0 || self.progress * D > NAV_BACK;
          if (show === navShown) return;
          navShown = show;
          gsap.to(nav, { opacity: show ? 1 : 0, duration: 0.3, overwrite: true });
        },
      });
      const entrance = trackEntrance(sectionRef.current!, (value) => {
        enterRef.current = value;
      });

      return () => {
        gsap.ticker.remove(update);
        st.kill();
        entrance.kill();
      };
    }, sectionRef);

    return () => {
      ctx.revert();
      if (nav) gsap.set(nav, { opacity: 1 });
    };
  }, []);

  return (
    <div ref={sectionRef} data-scene="cinematic-travel" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div ref={backdropRef} className="pointer-events-none absolute inset-0 bg-[var(--surface-dark)]" />

      <div ref={photoWrapRef} className="pointer-events-none absolute inset-0">
        {MOMENTS.map((moment, i) => (
          <div
            key={moment.time}
            ref={(el) => {
              photoRefs.current[i] = el;
            }}
            className="absolute inset-0 bg-cover bg-center opacity-0"
            style={{ backgroundImage: `url(${moment.photo})` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div ref={dayHeadlineRef} className="text-center text-white opacity-0">
          <p className="font-display text-[clamp(2.75rem,6.5vw,6.5rem)] leading-none tracking-[-0.02em]">FRIDAY</p>
          <p className="mt-2 text-sm tracking-[0.2em] text-white/85 uppercase">Oct 16</p>
        </div>
      </div>

      {MOMENTS.map((moment, i) => (
        <div key={`${moment.time}-content`} className="pointer-events-none absolute inset-x-0 bottom-[16%] text-center text-white">
          <div
            ref={(el) => {
              textRefs.current[i] = el;
            }}
            className="opacity-0"
          >
            <p className="text-xs tracking-[0.2em] text-white/90 uppercase [text-shadow:0_1px_10px_rgb(0_0_0/0.5)]">
              {moment.time} · {moment.location}
            </p>
            <p className="mt-2 font-display text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-[-0.01em] [text-shadow:0_1px_18px_rgb(0_0_0/0.45)]">{moment.message}</p>
          </div>
          <div
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="mx-auto mt-5 w-fit rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 opacity-0 backdrop-blur-sm"
          >
            <p className="text-sm font-medium">{moment.card.label}</p>
            <p className="text-xs text-white/85">{moment.card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
