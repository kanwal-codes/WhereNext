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
  if (variant === "route") {
    return (
      <div aria-hidden className={`landing-bloom pointer-events-none absolute inset-x-0 bottom-0 h-[90%] ${className ?? ""}`}>
        <div className="landing-route-wash" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" fill="none">
          <path className="landing-route-path" d="M-40 640 C 220 520, 330 700, 560 560 S 900 360, 1100 500 S 1380 420, 1500 300" stroke="oklch(0.45 0.1 250 / 0.45)" strokeWidth="2" strokeLinecap="round" />
          {[[220, 590], [560, 560], [900, 452], [1100, 500], [1330, 400]].map(([x, y]) => (
            <g key={`${x}`}>
              <circle cx={x} cy={y} r="16" fill="oklch(0.78 0.12 195 / 0.25)" />
              <circle cx={x} cy={y} r="5" fill="oklch(0.42 0.12 255)" />
            </g>
          ))}
        </svg>
        <div className="landing-bloom-grain" />
      </div>
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
