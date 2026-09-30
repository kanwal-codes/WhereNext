export type BloomVariant = "dusk" | "sunrise" | "horizon" | "route";

/**
 * The light behind the first screen. Purely decorative: hidden from assistive tech and never
 * catches a click. Drifting layers stop for anyone who prefers reduced motion.
 *   dusk     pink/violet/blue glow rising from the bottom
 *   sunrise  the same glow in warm sand, teal and deep indigo
 *   horizon  a low sun over a thin horizon line and a dusk sea
 *   route    a soft wash with a dashed trip route and pins drifting behind the box
 */
export function LandingBloom({ variant = "dusk", className }: { variant?: BloomVariant; className?: string }) {
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
  if (variant === "route") return <RouteBloom className={className} />;
  return (
    <div aria-hidden className={`landing-bloom ${variant === "sunrise" ? "landing-bloom-sunrise" : ""} pointer-events-none absolute inset-x-0 bottom-0 h-[82%] ${className ?? ""}`}>
      <div className="landing-bloom-layer landing-bloom-a" />
      <div className="landing-bloom-layer landing-bloom-b" />
      <div className="landing-bloom-grain" />
    </div>
  );
}

const ROUTE = "M-60 700 C 140 610, 260 720, 430 706 S 700 790, 900 742 S 1180 700, 1330 500 S 1470 350, 1520 320";
// Sample stops, drawn along the route. Decorative: they are not anyone's trip.
const STOPS: Array<{ x: number; y: number; city: string; note: string; wide?: boolean }> = [
  { x: 283, y: 693, city: "Lisbon", note: "3 nights" },
  { x: 664, y: 739, city: "Porto", note: "2 nights" },
  { x: 1110, y: 688, city: "Seville", note: "4 nights" },
  { x: 1343, y: 483, city: "Granada", note: "2 nights" },
];

/** A soft map-like scene: contour lines, a dashed route with a traveller on it, and stops labelled in glass. */
function RouteBloom({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`landing-bloom pointer-events-none absolute inset-x-0 bottom-0 h-[92%] ${className ?? ""}`}>
      <div className="landing-route-wash" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="route-ink" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="oklch(0.62 0.12 195)" />
            <stop offset="0.55" stopColor="oklch(0.48 0.14 262)" />
            <stop offset="1" stopColor="oklch(0.62 0.15 30)" />
          </linearGradient>
        </defs>
        <g className="landing-route-contours" stroke="oklch(0.5 0.06 230 / 0.16)" strokeWidth="1.2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M-80 ${720 - i * 38} C 200 ${640 - i * 46}, 420 ${790 - i * 36}, 700 ${690 - i * 40} S 1160 ${560 - i * 34}, 1520 ${620 - i * 42}`} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={`e${i}`} cx="1180" cy="290" rx={70 + i * 46} ry={34 + i * 24} />
          ))}
        </g>
        <path d={ROUTE} stroke="oklch(1 0 0 / 0.7)" strokeWidth="7" strokeLinecap="round" />
        <path className="landing-route-path" d={ROUTE} stroke="url(#route-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle r="7" fill="oklch(0.62 0.15 30)" className="landing-route-traveller">
          <animateMotion dur="26s" repeatCount="indefinite" path={ROUTE} />
        </circle>
        {STOPS.map((stop) => (
          <g key={stop.city}>
            <circle cx={stop.x} cy={stop.y} r="18" fill="oklch(0.78 0.12 195 / 0.28)" />
            <circle cx={stop.x} cy={stop.y} r="6" fill="oklch(0.4 0.13 262)" stroke="white" strokeWidth="2" />
            <g className="landing-route-label" transform={`translate(${stop.x - 52} ${stop.y - 62})`}>
              <rect width="104" height="38" rx="19" fill="oklch(1 0 0 / 0.72)" stroke="oklch(1 0 0 / 0.9)" />
              <text x="52" y="16" textAnchor="middle" fontSize="13" fontWeight="600" fill="oklch(0.25 0.03 260)">{stop.city}</text>
              <text x="52" y="30" textAnchor="middle" fontSize="10.5" fill="oklch(0.5 0.03 260)">{stop.note}</text>
            </g>
          </g>
        ))}
      </svg>
      <div className="landing-bloom-grain" />
    </div>
  );
}
