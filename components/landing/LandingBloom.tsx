import { BedDouble, CalendarDays, Plane, Utensils, type LucideIcon } from "lucide-react";

export type BloomVariant = "dusk" | "sunrise" | "horizon" | "route" | "trip" | "shore";

/**
 * The light behind the first screen. Purely decorative: hidden from assistive tech and never
 * catches a click. Drifting layers stop for anyone who prefers reduced motion.
 *   dusk     pink/violet/blue glow rising from the bottom
 *   sunrise  the same glow in warm sand, teal and deep indigo
 *   horizon  a low sun over a thin horizon line and a dusk sea
 *   shore    dry sand, wet sand and a tide; the prompt box is the foam where the water reaches it
 *   route    a soft wash with a trip route that draws itself as the visitor writes
 *   trip     the route plus example trip cards (flight, stay, day, dinner) that come into focus as they write
 */
export function LandingBloom({ variant = "shore", progress = 0, className }: { variant?: BloomVariant; progress?: number; className?: string }) {
  if (variant === "horizon") {
    return (
      <div aria-hidden className={`landing-bloom landing-bloom-horizon pointer-events-none absolute inset-x-0 bottom-0 ${className ?? ""}`}>
        <div className="landing-horizon-sky" />
        <div className="landing-horizon-sun" />
        <div className="landing-horizon-sea" />
        <div className="landing-horizon-line" />
        <div className="landing-bloom-grain" />
      </div>
    );
  }
  if (variant === "shore") return <ShoreBloom />;
  if (variant === "route") return <RouteBloom progress={progress} className={className} />;
  if (variant === "trip") {
    return (
      <>
        <RouteBloom progress={progress} className={className} />
        <TripCards progress={progress} />
      </>
    );
  }
  return (
    <div aria-hidden className={`landing-bloom ${variant === "sunrise" ? "landing-bloom-sunrise" : ""} pointer-events-none absolute inset-x-0 bottom-0 h-[82%] ${className ?? ""}`}>
      <div className="landing-bloom-layer landing-bloom-a" />
      <div className="landing-bloom-layer landing-bloom-b" />
      <div className="landing-bloom-grain" />
    </div>
  );
}

const ROUTE = "M-60 700 C 140 610, 260 720, 430 706 S 700 790, 900 742 S 1200 690, 1343 483";
// Where the pins sit on the route (measured along it), kept clear of the prompt box and chips.
const STOPS: Array<[number, number]> = [[283, 693], [664, 739], [1110, 688], [1343, 483]];

/**
 * A soft wash and one quiet route with a few pins. It answers the headline: as the visitor writes
 * their idea the route draws itself in and the pins light up one by one, so the trip "takes shape".
 * Empty, it is just the faint dashed route.
 */
function RouteBloom({ progress, className }: { progress: number; className?: string }) {
  return (
    <div aria-hidden className={`landing-bloom pointer-events-none absolute inset-x-0 bottom-0 h-[92%] ${className ?? ""}`}>
      <div className="landing-route-wash" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" fill="none">
        {/* Like a route on a map: a pale casing, the road itself, then the stretch planned so far drawn over it. */}
        <path d={ROUTE} stroke="oklch(1 0 0 / 0.85)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        <path d={ROUTE} stroke="oklch(0.62 0.05 255 / 0.4)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path className="landing-route-drawn" d={ROUTE} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} stroke="oklch(0.42 0.14 262)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {STOPS.map(([x, y], i) => {
          const last = i === STOPS.length - 1;
          const lit = progress >= (i + 0.6) / STOPS.length;
          return last ? (
            // The destination: a pin.
            <g key={x} className="landing-route-stop" data-lit={lit} transform={`translate(${x} ${y})`}>
              <path d="M0 -4 C -16 -24, -16 -50, 0 -50 C 16 -50, 16 -24, 0 -4 Z" fill="oklch(0.62 0.17 28)" stroke="white" strokeWidth="3" strokeLinejoin="round" />
              <circle cy="-33" r="5.5" fill="white" />
            </g>
          ) : (
            <g key={x} className="landing-route-stop" data-lit={lit}>
              <circle cx={x} cy={y} r="10" fill="white" stroke="oklch(0.42 0.14 262)" strokeWidth="4" />
            </g>
          );
        })}
      </svg>
      <div className="landing-bloom-grain" />
    </div>
  );
}

type Card = { Icon: LucideIcon; title: string; meta: string; side: "left" | "right"; top: string; at: number };

// Example content only: what Roam tends to put together, not anyone's real trip.
const CARDS: Card[] = [
  { Icon: CalendarDays, title: "Day 1 · Alfama walk", meta: "Viewpoints, tram 28, fado", side: "right", top: "27%", at: 0.12 },
  { Icon: Plane, title: "YUL → LIS", meta: "Sat 12 Apr · 7h 05 · direct", side: "left", top: "34%", at: 0.3 },
  { Icon: Utensils, title: "Dinner · Tasca do Chico", meta: "Fri 8:30 pm · table for 4", side: "right", top: "44%", at: 0.5 },
  { Icon: BedDouble, title: "Alfama · 3 nights", meta: "Boutique · €142 a night", side: "left", top: "50%", at: 0.7 },
];

/**
 * Example trip cards in the side margins. They start soft and blurred and come into focus one by
 * one as the visitor writes, so the page shows the product doing what the headline promises.
 * Hidden where there is no room beside the box.
 */
function TripCards({ progress }: { progress: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden min-[1360px]:block">
      {CARDS.map(({ Icon, title, meta, side, top, at }) => (
        <div
          key={title}
          data-lit={progress >= at}
          className={`landing-trip-card absolute flex w-[15rem] items-center gap-3 rounded-2xl border border-white/70 bg-white/65 px-3.5 py-3 text-left shadow-[0_14px_40px_-18px_oklch(0.4_0.1_265/0.45)] backdrop-blur-xl ${side === "left" ? "left-[3.5%]" : "right-[3.5%]"}`}
          style={{ top }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[oklch(0.42_0.14_262/0.1)] text-[oklch(0.42_0.14_262)]">
            <Icon className="size-[1.1rem]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.8rem] font-semibold text-foreground">{title}</span>
            <span className="block truncate text-[0.7rem] text-muted-foreground">{meta}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const WAVE = "M0 16 C 120 4, 240 28, 380 14 S 640 0, 800 18 S 1100 30, 1250 12 S 1400 6, 1440 14 L1440 600 L0 600 Z";
const WAVE_LINE = "M0 16 C 120 4, 240 28, 380 14 S 640 0, 800 18 S 1100 30, 1250 12 S 1400 6, 1440 14";

/**
 * A quiet beach: dry sand fading to wet sand, then shallow water whose edge slowly comes and goes.
 * The waterline sits at the bottom of the prompt box, which is drawn as the foam the water leaves
 * (see FoamEdge in TripPromptBox), so the box and the shore read as one thing.
 */
function ShoreBloom() {
  return (
    <div aria-hidden className="landing-shore pointer-events-none absolute inset-0 overflow-hidden">
      <div className="landing-shore-sand" />
      <div className="landing-shore-tide">
        <div className="landing-shore-wet" />
        <div className="landing-shore-gloss" />
        <svg className="landing-shore-water" viewBox="0 0 1440 600" preserveAspectRatio="none" fill="none">
          <defs>
            <linearGradient id="shore-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(0.92 0.05 190)" />
              <stop offset="0.35" stopColor="oklch(0.82 0.085 200)" />
              <stop offset="1" stopColor="oklch(0.64 0.1 228)" />
            </linearGradient>
            <filter id="shore-soft" x="-5%" y="-50%" width="110%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          <path d={WAVE} fill="url(#shore-water)" />
          <path d={WAVE_LINE} stroke="white" strokeWidth="14" strokeLinecap="round" opacity="0.85" filter="url(#shore-soft)" />
          <path d={WAVE_LINE} transform="translate(0 22)" stroke="white" strokeWidth="7" strokeLinecap="round" strokeDasharray="1 14" opacity="0.6" />
        </svg>
      </div>
      <div className="landing-shore-light landing-shore-light-a" />
      <div className="landing-shore-light landing-shore-light-b" />
      <div className="landing-shore-swell">
        <svg className="landing-shore-water" viewBox="0 0 1440 600" preserveAspectRatio="none" fill="none">
          <path d={WAVE_LINE} transform="translate(0 40)" stroke="white" strokeWidth="5" strokeLinecap="round" opacity="0.5" filter="url(#shore-soft)" />
        </svg>
      </div>
      <div className="landing-bloom-grain" style={{ opacity: 0.2 }} />
    </div>
  );
}
