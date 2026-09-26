"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { progressBetween } from "@/components/landing/choreography";
import { BedDouble, DollarSign, Landmark, Route, TicketCheck, Trees, Utensils, Wine, type LucideIcon } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Chip = {
  label: string;
  angle: number;
  origin: { x: number; y: number };
  // Uneven size/weight (Design_Language §11's "magazine spread, not a grid
  // of identical cards" principle, applied here too) — every chip was
  // previously the same white pill at the same weight, which is what read
  // as a wireframe instead of a designed moment.
  size: "sm" | "md" | "lg";
  // Accent goes only to the chips that actually feed something later (see
  // CONNECTIONS below) — the coral highlight has a narrative job (these are
  // literally the constraints Roam is using), not decoration for its own sake.
  accent?: boolean;
  rotation: number;
  // Icons reuse ChaosScene's "icon in a coral circle" pattern one scene
  // earlier in the same flow — without this, the two related scenes
  // (scatter → orbit) looked like two different design systems. People get
  // an avatar instead, matching Hero/GroupPlanning/PlansChange everywhere
  // else on the site, since a text-only pill was the one chip with zero
  // visual identity.
  icon?: LucideIcon;
  avatarInitial?: string;
};

// Evenly spaced around the orbit circle (36° apart), each starting from a
// scattered off-screen point so the reveal reads as "chaos pulled into
// order" rather than chips just fading in where they'll end up.
const CHIPS: Chip[] = [
  { label: "Vegetarian", angle: -90, origin: { x: -60, y: -320 }, size: "lg", accent: true, rotation: -3, icon: Utensils },
  { label: "No museums", angle: -54, origin: { x: 260, y: -260 }, size: "lg", accent: true, rotation: 2, icon: Landmark },
  { label: "$900 / person", angle: -18, origin: { x: 340, y: -60 }, size: "lg", accent: true, rotation: -2, icon: DollarSign },
  { label: "Parks", angle: 18, origin: { x: 300, y: 220 }, size: "sm", rotation: 3, icon: Trees },
  { label: "Concert · Oct 16", angle: 54, origin: { x: 120, y: 320 }, size: "lg", accent: true, rotation: -1, icon: TicketCheck },
  { label: "Alex", angle: 90, origin: { x: -80, y: 320 }, size: "sm", rotation: 2, avatarInitial: "A" },
  { label: "Maya", angle: 126, origin: { x: -280, y: 240 }, size: "sm", rotation: -2, avatarInitial: "M" },
  { label: "Train", angle: 162, origin: { x: -340, y: 40 }, size: "md", rotation: 1, icon: Route },
  { label: "Hotel", angle: 198, origin: { x: -300, y: -180 }, size: "md", rotation: -3, icon: BedDouble },
  { label: "Nightlife", angle: 234, origin: { x: -100, y: -340 }, size: "md", rotation: 2, icon: Wine },
];

// Was land-city.jpg — a Mediterranean dusk street with no Quebec
// architecture at all, the exact "doesn't read as Montreal" problem this
// whole dive is supposed to pay off. Real Montreal night skyline now.
const PHOTO = "/design/land-montreal-night.jpg";
const RADIUS = 220;
const ORBIT_PERIOD_S = 65;
// Real-scroll testing (not just checking computed opacity at calculated
// scrollY values) showed the old 1700:900 legacy ratio starved the dive:
// on an ordinary scroll it consumed most of the pin just watching chips
// orbit, then blew past the mask reveal, the photo, and the headline in a
// single wheel flick. Dive gets the larger share now — four beats worth
// of reveal live in there, orbiting chips only need one unhurried pass.
const SPLIT = 0.42;

/**
 * Storyboard Frames 3 & 4 — Context/Gravity and the Montreal dive, merged
 * into one continuous pinned scene. Design_Language §44 names only three
 * major camera moves on the whole page, and "Context → Discover (zoom in)"
 * is one of them — originally this was built as two separate components
 * (ContextScene + MontrealDiveScene), each with its own pin and its own
 * echo of the trip card and chips. That produced a hard cut and duplicate,
 * degraded-looking DOM right at the boundary (a fresh unlabeled set of
 * chips appearing under the real, labeled ones) instead of one continuous
 * camera move. Merged so the same card and the same chip elements persist
 * across both beats: orbit resolves → the same card scales and masks into
 * Montreal photography — no pin release in between.
 *
 * Chaos resolving into orbit: chips arc inward (a parabolic bump, not a
 * straight line) toward a forming central trip card, settle into a
 * barely-perceptible continuous orbit, then — once the dive begins — fall
 * back inward along that same radial direction, shrinking and losing their
 * label text early so they read as dissolving into small dots before being
 * absorbed into the card (echoes BookingsScene's "documents fly home"
 * consolidation later in the page). Only once every chip has landed does
 * the card itself dissolve into a giant text-masked "MONTREAL" that
 * crossfades to the real photograph (Build_Plan step 2's proven approach —
 * crossfade at ~2x scale, before legibility breaks down; not yet verified
 * in Safari); the canvas fades warm off-white → black in that same window,
 * not before, so nothing tints the scene while the chips are still
 * settling. The orbit itself runs on elapsed time, independent of scroll,
 * since "one orbit every 50-80s" is meant to keep going once the visitor
 * arrives here, not be tied to how much they scroll.
 *
 * One continuous ticker function drives every element each frame (reveal
 * progress from scroll + orbit angle from elapsed time), the same "single
 * driver, plain gsap.set" approach as ChaosScene — avoids two separate
 * GSAP tweens fighting over the same transform, and avoids the "call
 * gsap.set twice with different values in one update" mistake (last call
 * wins) by computing each element's final value once before setting it.
 */
export function ContextScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headline1Ref = useRef<HTMLHeadingElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const orbitRingRef = useRef<HTMLDivElement>(null);
  const diveBackdropRef = useRef<HTMLDivElement>(null);
  const maskTextRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const headline2Ref = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gsap.set(cardRef.current, { opacity: 0 });
      gsap.set(headline1Ref.current, { opacity: 0 });
      CHIPS.forEach((_, i) => gsap.set(chipRefs.current[i], { opacity: 0 }));
      gsap.set(orbitRingRef.current, { opacity: 0 });
      gsap.set(diveBackdropRef.current, { opacity: 1 });
      gsap.set(maskTextRef.current, { opacity: 0 });
      gsap.set(photoRef.current, { opacity: 1 });
      gsap.set(headline2Ref.current, { opacity: 1 });
      return;
    }

    const startTime = performance.now();

    const update = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const orbitAngle = (elapsed / ORBIT_PERIOD_S) * 360;
      // Real scrolling arrives in uneven bursts (wheel notches, trackpad
      // flicks), and this scene's onUpdate wrote straight into every
      // threshold with nothing damping it — every beat above snapped in
      // lockstep with raw scroll delta instead of playing out. Lerping
      // toward the raw scroll progress each frame is the same "decouple
      // from scroll jitter" idea already used for the orbit's elapsed-time
      // motion, applied to the reveal value itself.
      smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.12;
      const reveal = smoothedRevealRef.current;
      const contextProgress = progressBetween(reveal, 0, SPLIT);
      const diveProgress = progressBetween(reveal, SPLIT, 1);
      // Dive has two beats: chips fall home first (0 -> CONSOLIDATE_END),
      // then — only once they've landed — the card dissolves into the
      // photo. photoProgress re-runs the old 0..1 dive timeline unchanged,
      // just starting later, so none of those thresholds needed reworking.
      const CONSOLIDATE_END = 0.35;
      const consolidateProgress = progressBetween(diveProgress, 0.12, CONSOLIDATE_END);
      const photoProgress = progressBetween(diveProgress, CONSOLIDATE_END, 0.92);

      // The small trip card forms during the context phase, then dissolves
      // into the mask once the chips have finished falling home — one
      // combined value per element, set once, so phases can never fight.
      gsap.set(cardRef.current, {
        scale: 0.7 + progressBetween(contextProgress, 0.1, 0.6) * 0.3,
        opacity: progressBetween(contextProgress, 0, 0.35) * (1 - progressBetween(photoProgress, 0, 0.15)),
      });
      // Stays up through the chips falling home — reinforces "the whole
      // trip" while that's literally what's happening on screen — and only
      // clears once the photo dive itself begins.
      gsap.set(headline1Ref.current, { opacity: progressBetween(contextProgress, 0.68, 0.82) * (1 - progressBetween(photoProgress, 0, 0.1)) });

      CHIPS.forEach((chip, i) => {
        const el = chipRefs.current[i];
        const labelEl = chipLabelRefs.current[i];
        if (!el) return;
        const chipReveal = progressBetween(contextProgress, i * 0.04, i * 0.04 + 0.34);
        const rad = ((chip.angle + orbitAngle) * Math.PI) / 180;
        const orbitX = Math.cos(rad) * RADIUS;
        const orbitY = Math.sin(rad) * RADIUS;
        const arcBump = -70 * 4 * chipReveal * (1 - chipReveal);
        const settledX = chip.origin.x + (orbitX - chip.origin.x) * chipReveal;
        const settledY = chip.origin.y + (orbitY - chip.origin.y) * chipReveal + arcBump;

        // Falling home: staggered per chip, arcing back toward the card
        // (not a straight line), shrinking to a small dot as it goes. The
        // label fades out early so what's left approaching the card really
        // reads as a dot rather than a shrinking pill.
        const fallStart = i * 0.06;
        const fall = progressBetween(consolidateProgress, fallStart, fallStart + 0.4);
        const fallBump = -30 * 4 * fall * (1 - fall);
        const x = settledX * (1 - fall);
        const y = settledY * (1 - fall) - fallBump;
        const scale = 1 - fall * 0.85;
        const shapeOpacity = Math.max(chipReveal, 0.001) * (1 - progressBetween(fall, 0.85, 1));
        const labelOpacity = 1 - progressBetween(fall, 0, 0.4);

        gsap.set(el, { x, y, scale, opacity: shapeOpacity, rotate: chip.rotation * (1 - fall) });
        if (labelEl) gsap.set(labelEl, { opacity: labelOpacity });
      });

      // A faint stroked circle at the orbit radius — without it the chips
      // just float with no center-of-gravity cue, reading as scattered
      // pills rather than an intentional constellation. Fades in with the
      // chips, out as they fall home.
      gsap.set(orbitRingRef.current, {
        opacity: progressBetween(contextProgress, 0.05, 0.3) * (1 - progressBetween(consolidateProgress, 0, 0.3)),
      });

      // Only once every chip has landed: canvas fades warm off-white ->
      // black well before the photo itself appears, then the card's
      // dissolve (above) hands off to a giant text-masked "MONTREAL" that
      // scales up, then crossfades to the real photograph rather than
      // continuing to scale past legibility.
      gsap.set(diveBackdropRef.current, { opacity: progressBetween(photoProgress, 0, 0.2) });
      // MONTREAL mask: reveal, then a real hold at full size/opacity (0.24-0.56)
      // before crossfading to the photo — previously it scaled straight through
      // with no readable pause, so the word never actually registered.
      gsap.set(maskTextRef.current, {
        opacity: progressBetween(photoProgress, 0.12, 0.24) * (1 - progressBetween(photoProgress, 0.56, 0.68)),
        scale: 1 + progressBetween(photoProgress, 0.24, 0.6),
      });
      gsap.set(photoRef.current, { opacity: progressBetween(photoProgress, 0.56, 0.7) });
      // Photo holds alone (0.7-0.84) before the headline arrives, so the
      // destination actually gets seen instead of being instantly covered by
      // text. Was also fading back to 0 by reveal=1 along with the photo and
      // backdrop above — headline, photo, AND backdrop all dissolving to
      // blank in the pin's last 4% (~208px of 5200) meant the destination
      // photo was barely readable before the whole frame vanished right at
      // the handoff to Discover. Every other scene's closing beat just
      // holds through to pin release instead of fading itself out — this
      // now matches that.
      gsap.set(headline2Ref.current, { opacity: progressBetween(photoProgress, 0.84, 0.94) });
    };

    gsap.ticker.add(update);

    const st = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top top",
      // 2600 measured out fine on paper but disappeared in ~3 ordinary wheel
      // scrolls in practice — the whole dive (mask reveal, hold, photo, payoff)
      // never got seen, just skipped straight into the next section. Longer
      // pin so a real scroll actually plays the sequence instead of skipping it.
      end: "+=5200",
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
  }, []);

  return (
    <div id="how-it-works" ref={sectionRef} data-scene="context" className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background">
      <div ref={diveBackdropRef} className="pointer-events-none absolute inset-0 bg-black opacity-0" />
      <div
        ref={orbitRingRef}
        className="pointer-events-none absolute top-1/2 left-1/2 rounded-full border border-foreground/10 opacity-0"
        style={{ width: RADIUS * 2, height: RADIUS * 2, translate: "-50% -50%" }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div
          ref={cardRef}
          className="flex size-44 flex-col items-center justify-center gap-1 rounded-full border border-border bg-surface text-center opacity-0 shadow-lift"
        >
          <p className="font-display text-lg font-semibold tracking-tight text-coral">MONTREAL</p>
          <p className="text-xs text-muted-foreground">OCT 16-19</p>
          <p className="text-xs text-muted-foreground">4 FRIENDS</p>
        </div>
      </div>

      {CHIPS.map((chip, i) => {
        const sizeClass =
          chip.size === "lg" ? "px-4 py-2 text-sm font-medium" : chip.size === "sm" ? "px-3 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs";
        const accentClass = chip.accent ? "border-coral/30 bg-coral-soft text-coral shadow-lift" : "border-border bg-surface shadow-soft";
        const Icon = chip.icon;
        return (
          <div key={chip.label} className="absolute top-1/2 left-1/2" style={{ translate: "-50% -50%" }}>
            <div
              ref={(el) => {
                chipRefs.current[i] = el;
              }}
              className={`flex items-center gap-1.5 rounded-full border whitespace-nowrap opacity-0 ${sizeClass} ${accentClass}`}
            >
              {chip.avatarInitial ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                  {chip.avatarInitial}
                </span>
              ) : (
                Icon && (
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full ${chip.accent ? "bg-coral text-white" : "bg-coral-soft text-coral"}`}
                  >
                    <Icon className="size-3" strokeWidth={2} />
                  </span>
                )
              )}
              <span
                ref={(el) => {
                  chipLabelRefs.current[i] = el;
                }}
              >
                {chip.label}
              </span>
            </div>
          </div>
        );
      })}

      <div className="pointer-events-none absolute inset-x-0 bottom-[7%] px-6 text-center">
        <h2 ref={headline1Ref} className="font-display text-[clamp(2.5rem,5.5vw,5.5rem)] tracking-[-0.02em] opacity-0">
          Roam gets the whole trip.
        </h2>
      </div>

      <div
        ref={maskTextRef}
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-cover bg-center text-transparent opacity-0"
        style={{
          backgroundImage: `url(${PHOTO})`,
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          // The source photo is a dim dusk shot — clipped straight into text
          // it reads as a flat, illegible smear against the black backdrop.
          filter: "brightness(1.7) contrast(1.15) saturate(1.2)",
        }}
      >
        <span className="font-display text-[14vw] leading-none font-medium tracking-tight">MONTREAL</span>
      </div>
      <div ref={photoRef} className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-0" style={{ backgroundImage: `url(${PHOTO})` }} />

      <div className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center">
        <h2 ref={headline2Ref} className="font-display text-[clamp(2.75rem,6.5vw,6.5rem)] tracking-[-0.02em] text-white opacity-0">
          Saturday is wide open.
        </h2>
      </div>
    </div>
  );
}
