/**
 * The light behind the first screen: a broad soft glow of dusk colour (deep blue into violet into
 * the brand coral) rising from the lower half of the page. It gives the prompt box something to sit
 * on, so the box reads as lit glass instead of a white card on a white page. Two layers drift at
 * different speeds so it is never quite still; both stop for anyone who prefers reduced motion.
 * Purely decorative: hidden from assistive tech and never catches a click.
 */
export function LandingBloom({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`landing-bloom pointer-events-none absolute inset-x-0 bottom-0 h-[82%] ${className ?? ""}`}>
      <div className="landing-bloom-layer landing-bloom-a" />
      <div className="landing-bloom-layer landing-bloom-b" />
      <div className="landing-bloom-grain" />
    </div>
  );
}
