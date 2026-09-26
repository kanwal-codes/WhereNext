"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { progressBetween } from "@/components/landing/choreography";

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
  { time: "10:18 PM", location: "Old Montreal", message: "Dinner · 8 minute walk.", card: { label: "Olive et Gourmando · 10:30", sub: "Reservation" }, photo: "/design/trip-hero-night.jpg" },
];

// Frame 11 spans 15,600-18,500px (Storyboard) — a short intro (backdrop goes
// dark, "FRIDAY" holds) then four roughly-equal beats, each getting a
// symmetric crossfade window straddling its boundary with the next so two
// photos are briefly visible together, never a hard cut to black between them.
const INTRO_END = 0.12;
const BEAT_SPAN = (1 - INTRO_END) / MOMENTS.length;
const CROSSFADE = BEAT_SPAN * 0.15;

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
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.08;
        const p = smoothedRevealRef.current;

        gsap.set(backdropRef.current, { opacity: 1 });
        gsap.set(dayHeadlineRef.current, {
          opacity: progressBetween(p, 0.04, 0.08) * (1 - progressBetween(p, INTRO_END, INTRO_END + CROSSFADE)),
        });
        gsap.set(photoWrapRef.current, { scale: 1 + p * 0.04 });

        MOMENTS.forEach((_, i) => {
          const start = INTRO_END + i * BEAT_SPAN;
          const end = start + BEAT_SPAN;
          const fadeIn = progressBetween(p, start - CROSSFADE, start + CROSSFADE);
          const fadeOut = i === last ? 1 : 1 - progressBetween(p, end - CROSSFADE, end + CROSSFADE);
          const opacity = fadeIn * fadeOut;

          gsap.set(photoRefs.current[i], { opacity });
          gsap.set(textRefs.current[i], { opacity, y: (1 - fadeIn) * 14 });
          gsap.set(cardRefs.current[i], { opacity, y: 24 * (1 - progressBetween(p, start, start + BEAT_SPAN * 0.25)) });
        });
      };

      gsap.ticker.add(update);
      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=4200",
        pin: true,
        scrub: true,
        onEnter: () => nav && gsap.to(nav, { opacity: 0, duration: 0.25, overwrite: true }),
        onEnterBack: () => nav && gsap.to(nav, { opacity: 0, duration: 0.25, overwrite: true }),
        onLeaveBack: () => nav && gsap.to(nav, { opacity: 1, duration: 0.25, overwrite: true }),
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
    <div ref={sectionRef} data-scene="cinematic-travel" className="relative min-h-[100dvh] overflow-hidden bg-[#171717]">
      <div ref={backdropRef} className="pointer-events-none absolute inset-0 bg-[#171717]" />

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
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div ref={dayHeadlineRef} className="text-center text-white opacity-0">
          <p className="font-display text-[clamp(2.75rem,6.5vw,6.5rem)] leading-none tracking-[-0.02em]">FRIDAY</p>
          <p className="mt-2 text-sm tracking-[0.2em] text-white/70 uppercase">Oct 16</p>
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
            <p className="text-xs tracking-[0.2em] text-white/70 uppercase">
              {moment.time} · {moment.location}
            </p>
            <p className="mt-2 font-display text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-[-0.01em]">{moment.message}</p>
          </div>
          <div
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="mx-auto mt-5 w-fit rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 opacity-0 backdrop-blur-sm"
          >
            <p className="text-sm font-medium">{moment.card.label}</p>
            <p className="text-xs text-white/70">{moment.card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
