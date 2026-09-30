export type BloomVariant = "dusk" | "sunrise" | "horizon" | "route";

/**
 * The light behind the first screen. Purely decorative: hidden from assistive tech and never
 * catches a click. Drifting layers stop for anyone who prefers reduced motion.
 *   dusk     pink/violet/blue glow rising from the bottom
 *   sunrise  the same glow in warm sand, teal and deep indigo
 *   horizon  a low sun over a thin horizon line and a dusk sea
 *   route    a soft wash with a dashed trip route and pins drifting behind the box
 */
export function LandingBloom({ variant = "route", progress = 0, className }: { variant?: BloomVariant; progress?: number; className?: string }) {
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
  if (variant === "route") return <RouteBloom progress={progress} className={className} />;
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
