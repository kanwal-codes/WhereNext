"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { progressBetween } from "@/components/landing/choreography";
import { Check } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Stop = { time: string; title: string; sub: string; done: boolean; curveFraction: number; dx: number; dy: number };

// curveFraction = where this stop sits along the curved road, in drawing
// order (chronological). dx/dy is the offset from the dot to the CENTER of
// its label — position is computed in JS each frame from the label's own
// measured width/height (see the effect below), not via a CSS translate
// class, because Tailwind's translate utilities and GSAP's x/y writes don't
// reliably compose on the same element (GSAP owns the element's transform
// outright once it starts writing to it).
const STOPS: Stop[] = [
  { time: "10:30", title: "Brunch", sub: "Olive + Gourmando", done: false, curveFraction: 0.08, dx: 0, dy: 60 },
  { time: "12:00", title: "Old Montreal", sub: "Explore", done: false, curveFraction: 0.3, dx: 95, dy: -15 },
  // 2:30, not the original 2:00 — PlansChangeScene later dramatizes the
  // original 2:00 slot selling out and Roam rebooking for 2:30, and
  // Dinner below already reflects that same shift (7:30, not 7:00). This
  // curvy-road view is the settled, final state, so it needs to agree.
  { time: "2:30", title: "Pottery Workshop", sub: "✓ Booked", done: true, curveFraction: 0.52, dx: 115, dy: 10 },
  { time: "5:30", title: "Hotel", sub: "", done: false, curveFraction: 0.74, dx: 0, dy: 50 },
  { time: "7:30", title: "Dinner", sub: "✓ Reservation", done: true, curveFraction: 0.94, dx: 85, dy: -50 },
];

const CURVE_VIEWBOX = { w: 800, h: 600 };
const CURVE_PATH = "M 120 60 C 340 40, 420 260, 300 320 S 560 480, 640 560";
const DRAW_END = 0.85;
/** Converts a point in the SVG viewBox to on-screen pixels, matching preserveAspectRatio="xMidYMid meet". */
function svgToScreen(svgX: number, svgY: number) {
  const scale = Math.min(window.innerWidth / CURVE_VIEWBOX.w, window.innerHeight / CURVE_VIEWBOX.h);
  const offsetX = (window.innerWidth - CURVE_VIEWBOX.w * scale) / 2;
  const offsetY = (window.innerHeight - CURVE_VIEWBOX.h * scale) / 2;
  return { x: offsetX + svgX * scale, y: offsetY + svgY * scale };
}

/**
 * Storyboard Frames 6 & 7 — Card journey and Itinerary, merged into one
 * continuous curvy-road scene. First built as "curve draws, then straightens
 * into a vertical list" — that produced a second, unrelated-looking timeline
 * layout riding on the same scroll beat, which is exactly the kind of hard
 * cut `Design_Language` §44 rules out. Rebuilt so the curve IS the itinerary:
 * every real stop appears, with its time and title, directly on the road as
 * the line reaches it — nothing ever leaves the curve or reflows elsewhere.
 *
 * Two phases on one continuous progress value:
 * 1. Draw (0-85%): the road draws in; each of the 5 real stops pops in
 *    (dot + time/title, positioned right beside its own dot) exactly when
 *    the line reaches its point.
 * 2. Settle (85-100%): the fully-drawn road holds, "Saturday." fades in as
 *    the day's title — calm on purpose, this beat is for reading the plan.
 */
export function CardJourneyScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const curvePathRef = useRef<SVGPathElement>(null);
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const curvePoints = useRef<{ x: number; y: number }[]>(STOPS.map(() => ({ x: 0, y: 0 })));
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const curve = curvePathRef.current!;
    const curveLength = curve.getTotalLength();
    // With a dash and gap of exactly equal length (both == curveLength), any
    // rounding noise in the fractional strokeDashoffset the browser
    // rasterizes wraps a sliver of the pattern's "on" segment onto either
    // the path's start or its end (pushing the offset one way just moves
    // which end it lands on). strokeLinecap="round" turns that sliver into
    // a visible solid dot instead of letting it fade away. Fix: make the gap
    // longer than the dash, and offset into the middle of that gap at 0%
    // drawn, so the whole path sits with margin on both sides of the
    // dash/gap boundary. Both buffers scale to exactly 0 by full draw, so
    // the finished line is unaffected.
    const HIDE_BUFFER = 3;
    gsap.set(curve, { strokeDasharray: `${curveLength} ${curveLength + 6}`, strokeDashoffset: curveLength + HIDE_BUFFER });

    STOPS.forEach((stop, i) => {
      const pt = curve.getPointAtLength(stop.curveFraction * curveLength);
      curvePoints.current[i] = { x: pt.x, y: pt.y };
    });

    // dx/dy target the label's center; convert to the top-left position GSAP
    // actually sets, using the label's own rendered size.
    function labelTopLeft(i: number, dotPt: { x: number; y: number }, stop: Stop) {
      const el = markerRefs.current[i];
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      return { x: dotPt.x + stop.dx - w / 2, y: dotPt.y + stop.dy - h / 2 };
    }

    if (reduce) {
      STOPS.forEach((stop, i) => {
        const dotPt = svgToScreen(curvePoints.current[i].x, curvePoints.current[i].y);
        const labelPt = labelTopLeft(i, dotPt, stop);
        gsap.set(dotRefs.current[i], { x: dotPt.x, y: dotPt.y, scale: 1 });
        gsap.set(markerRefs.current[i], { x: labelPt.x, y: labelPt.y, opacity: 1 });
      });
      gsap.set(headlineRef.current, { opacity: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.1;
        const p = smoothedRevealRef.current;
        const draw = progressBetween(p, 0.04, DRAW_END);

        gsap.set(curve, { strokeDashoffset: (curveLength + HIDE_BUFFER) * (1 - draw) });

        STOPS.forEach((stop, i) => {
          const revealed = progressBetween(draw, stop.curveFraction - 0.03, stop.curveFraction + 0.02);
          const dotPt = svgToScreen(curvePoints.current[i].x, curvePoints.current[i].y);
          const labelPt = labelTopLeft(i, dotPt, stop);
          gsap.set(dotRefs.current[i], { x: dotPt.x, y: dotPt.y, scale: 0.7 + revealed * 0.3, opacity: revealed });
          gsap.set(markerRefs.current[i], { x: labelPt.x, y: labelPt.y + (1 - revealed) * 12, opacity: revealed });
        });

        // Was fading back out via (1 - progressBetween(p, 0.95, 1)) — full
        // opacity only from p=0.91 to p=0.95, then gone again by p=1, so
        // "Saturday." was on screen for about 4% of the pin before
        // vanishing right at the handoff to PlansChangeScene. Every other
        // scene's closing beat holds through to pin release instead of
        // fading itself back out — matching that here too.
        const titleIn = progressBetween(p, DRAW_END, DRAW_END + 0.06);
        gsap.set(headlineRef.current, { opacity: titleIn, y: (1 - titleIn) * 18 });
      };

      gsap.ticker.add(update);
      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=3600",
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
    <div ref={sectionRef} data-scene="card-journey" className="relative min-h-[100dvh] overflow-hidden bg-background pt-16">
      <svg
        viewBox={`0 0 ${CURVE_VIEWBOX.w} ${CURVE_VIEWBOX.h}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <path ref={curvePathRef} d={CURVE_PATH} fill="none" stroke="var(--coral)" strokeWidth={2} strokeLinecap="round" />
      </svg>

      {STOPS.map((stop, i) => (
        <div
          key={stop.time}
          ref={(el) => {
            dotRefs.current[i] = el;
          }}
          className="absolute top-0 left-0 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-coral text-white"
          style={{ transform: "scale(0)" }}
        >
          {stop.done && <Check className="size-3" strokeWidth={2.5} />}
        </div>
      ))}

      {STOPS.map((stop, i) => (
        <div
          key={`${stop.time}-label`}
          ref={(el) => {
            markerRefs.current[i] = el;
          }}
          className="absolute top-0 left-0 whitespace-nowrap opacity-0"
        >
          <p className="text-xs tabular-nums text-muted-foreground">{stop.time}</p>
          <p className="font-display text-lg">{stop.title}</p>
          {stop.sub && <p className="text-sm text-muted-foreground">{stop.sub}</p>}
        </div>
      ))}

      <div className="pointer-events-none absolute inset-y-0 left-[8%] flex items-center">
        <h2 ref={headlineRef} className="font-display text-[clamp(2.75rem,6.5vw,6.5rem)] tracking-[-0.03em] opacity-0">
          Saturday.
        </h2>
      </div>
    </div>
  );
}
