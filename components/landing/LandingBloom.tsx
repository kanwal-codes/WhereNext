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
// Where the pins sit on the route (measured along it), kept clear of the prompt box and chips.
const STOPS: Array<[number, number]> = [[283, 693], [664, 739], [1110, 688], [1343, 483]];

/** Just a soft wash and one quiet route with a few pins: a hint of "trip", nothing to read. */
function RouteBloom({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`landing-bloom pointer-events-none absolute inset-x-0 bottom-0 h-[92%] ${className ?? ""}`}>
      <div className="landing-route-wash" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" fill="none">
        <path className="landing-route-path" d={ROUTE} stroke="oklch(0.45 0.1 250 / 0.5)" strokeWidth="2.25" strokeLinecap="round" />
        {STOPS.map(([x, y]) => (
          <g key={x}>
            <circle cx={x} cy={y} r="17" fill="oklch(0.78 0.12 195 / 0.3)" />
            <circle cx={x} cy={y} r="5.5" fill="oklch(0.4 0.13 262)" stroke="white" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div className="landing-bloom-grain" />
    </div>
  );
}
