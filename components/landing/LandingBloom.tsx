import { BEACH_WATER_CLIP } from "@/components/landing/beachClip";

/**
 * The first screen's backdrop: surf reaching sand, seen from above.
 *
 * Wide landscape screens get a photograph with the page laid out on it (see `.beach-*` in
 * globals.css): the headline sits on the sand, the prompt pill sits in the foam ring, and on scroll
 * the water - a second copy of the photograph, cut along the foam - rises over the sand and
 * everything drawn in it, then washes out to the page colour so the next scene starts clean
 * (PromptScene drives that). Anything narrower or taller gets a drawn version of the same shore,
 * with the prompt drawn as foam, because the photograph's foam ring only fits a wide box.
 * Decorative: hidden from assistive tech and never catches a click.
 */
export function LandingBloom() {
  return (
    <>
      <div className="beach-narrow absolute inset-0">
        <ShoreBloom />
      </div>
      <div aria-hidden className="beach-bg beach-wide absolute inset-0 overflow-hidden">
        {/* The whole photograph, still: the sand and everything drawn on it. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop laid out by CSS */}
        <img src="/landing/beach.webp" alt="" fetchPriority="high" decoding="async" className="beach-stage beach-base" />
        {/* The water: a second copy of the photograph cut along the foam crest. On scroll it rises over the sand (and whatever is drawn in it). */}
        <div className="beach-stage beach-tide-wrap" data-beach-tide>
          <div className="beach-tide">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop laid out by CSS */}
            <img src="/landing/beach.webp" alt="" decoding="async" className="beach-water" style={{ clipPath: BEACH_WATER_CLIP }} />
            {/* Open water continues below the photograph's edge: its bottom strip, mirrored and repeated (the foam never reaches it, so the mirroring does not show). */}
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="beach-water-ext" data-flip={i % 2 === 0 ? "y" : undefined} style={{ top: `calc(${100 + i * 20}% - ${i + 1}px)` }} />
            ))}
            {/* ...and the farther it gets from the shore the calmer and deeper it looks. */}
            <div className="beach-water-deep" />
          </div>
        </div>
        {/* The page's own background, brought up over everything at the end of the tide so the next scene arrives from a clean page. */}
        <div className="absolute inset-0 bg-background opacity-0" data-beach-veil />
      </div>
    </>
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
