"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { advanceNarrative, clamp01, progressBetween } from "@/components/landing/choreography";
import { Heart } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

type Card = {
  title: string;
  category: string;
  meta: string;
  size: string;
  photo?: string;
  typeOnly?: boolean;
  focal?: boolean;
  rotation: number;
};

const CATEGORIES = ["Food", "Live music", "Outdoors", "Classes", "Nightlife"] as const;

// Deliberately uneven sizes — a magazine spread, not a grid of identical
// SaaS cards (Design_Language §11). Photos reassigned after the originals
// were checked against their labels and several didn't match what they
// claimed to show (a Mediterranean street for "Le Bain Public", jagged
// alpine peaks for the modest hill that is Mount Royal, a bakery for a
// pottery class) — real, purpose-sourced photography per card now.
const CARDS: Card[] = [
  { title: "Poutine crawl", category: "FOOD", meta: "3 stops · Old Montreal", size: "h-[30rem] w-[18rem]", photo: "/design/place-neighbourhood.jpg", rotation: -1.5 },
  // Was "Live at Bell Centre, Sat · 8 PM" — but Bad Bunny at Bell Centre is
  // already locked as a Friday Oct 16 plan (Hero, Chaos, Context, and
  // CinematicTravel all agree on that). Presenting the same show as an open
  // Saturday option contradicted a decision the story already made.
  { title: "Live at MTELUS", category: "LIVE MUSIC", meta: "Sat · 9 PM", size: "h-[22rem] w-[34rem]", photo: "/design/place-concert-arena.jpg", rotation: 1 },
  { title: "Mount Royal lookout", category: "OUTDOORS", meta: "20 min walk", size: "h-[20rem] w-[16rem]", photo: "/design/land-mount-royal.jpg", rotation: -1 },
  // Was "Most museums close Mondays" — a "no museums" chip is already
  // locked in back in Context, so surfacing museum content here at all
  // read as Roam not having listened.
  { title: "Grab a Bixi for the day", category: "GOOD TO KNOW", meta: "$5 unlimited rides", size: "h-[20rem] w-[14rem]", typeOnly: true, rotation: 1.5 },
  { title: "Pottery Workshop", category: "CLASSES", meta: "Saturday · 2 PM · $42", size: "h-[26rem] w-[20rem]", photo: "/design/place-pottery-wheel.jpg", focal: true, rotation: -1 },
  { title: "Le Bain Public", category: "NIGHTLIFE", meta: "Rooftop · Old Port", size: "h-[24rem] w-[19rem]", photo: "/design/place-rooftop-lounge.jpg", rotation: 1.5 },
];

const EXIT_DISTANCE = 500; // px of scroll spent on the pottery card leaving, after the pan finishes

/**
 * Storyboard Frame 5 — Discover, plus the card-selection beat that bridges
 * into scene 6. The one deliberate break from vertical scrolling on the
 * page: vertical scroll drives horizontal content movement.
 *
 * Second pass: the original version panned a row of always-fully-visible
 * cards past the viewport with nothing else happening — no per-card life,
 * category pills that never reacted to what was on screen, and several
 * photos that didn't match their own labels. Now each card scales up and
 * brightens as it nears the horizontal center of the viewport and recedes
 * as it leaves (measured live via getBoundingClientRect, not estimated from
 * index math, since card widths are deliberately uneven) — the same "focus
 * pulls toward center" feel as a real coverflow, giving the pan itself
 * continuous motion instead of a static row gliding by at one flat rate.
 * The category pills above now light up to match whichever card currently
 * holds that focus, so the taxonomy reads as live feedback, not decoration.
 *
 * Reuses HorizontalDiscoverSpike's findings directly (Build_Plan step 2):
 * the entry cue fades as part of the SAME timeline as the horizontal pan
 * (a separate ScrollTrigger didn't fade on schedule in the spike); cards
 * stay in real DOM/tab order matching the visual left-to-right order; a
 * skip-link and sr-only instruction cover keyboard/screen-reader users.
 * Highest accessibility risk in the whole build — budget real QA time here.
 */
export function DiscoverScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLParagraphElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const categoryRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 767px)").matches;

    if (reduce) {
      gsap.set(cueRef.current, { opacity: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      const track = trackRef.current!;
      const panDistance = track.scrollWidth - window.innerWidth;
      const totalDistance = panDistance + 900;
      const splitFraction = panDistance / totalDistance;

      const update = () => {
        // This scene is a direct-manipulation browse gallery, not a one-time
        // story beat — unlike Context/Finale/PlansChange (where heavy
        // smoothing stops a fast scroll from skipping past something that
        // only happens once), every card here is always present in the row.
        // The old 0.09 damping measured out to 500ms+ of the track still
        // visibly catching up after a single scroll input, which read as
        // the pan not actually tracking the scroll. Snappier now.
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.35;
        const p = smoothedRevealRef.current;
        const panProgress = clamp01(p / splitFraction);
        const exitProgress = progressBetween(p, splitFraction, 1);

        gsap.set(track, { x: -panDistance * panProgress });
        gsap.set(wordmarkRef.current, { x: -panDistance * panProgress * 0.4 });
        gsap.set(cueRef.current, { opacity: 1 - progressBetween(panProgress, 0, 0.08) });

        // Coverflow-style focus: each card is measured live against the
        // viewport center (not estimated from index/width math, since
        // sizes are deliberately uneven) and scales/brightens as it
        // approaches, dims and shrinks slightly as it recedes. The focal
        // card shares this exact same baseline — it used to carry its own
        // competing `x` on top of the track's, and since it's a child of
        // the track those transforms compose rather than override, so it
        // was panning at double speed the whole time, not just on exit.
        // Now it rides the coverflow like every sibling during the pan,
        // and the exit motion (below) only ever ADDS to that baseline once
        // exitProgress actually starts, instead of replacing it.
        const viewportCenter = window.innerWidth / 2;
        let nearestIndex = 0;
        let nearestDistance = Infinity;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const cardCenter = rect.left + rect.width / 2;
          const distance = Math.abs(cardCenter - viewportCenter);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
          const normalized = clamp01(distance / (window.innerWidth * 0.62));
          const baseScale = 1 - normalized * 0.1;
          const baseOpacity = 1 - normalized * 0.45;
          const baseY = normalized * 14;

          if (CARDS[i].focal) {
            gsap.set(el, {
              scale: baseScale * (1 - exitProgress * 0.15),
              x: exitProgress * 260,
              y: baseY - exitProgress * 220,
              opacity: baseOpacity * (1 - progressBetween(exitProgress, 0.7, 1)),
            });
          } else {
            // Once the pottery card starts its exit (flying up and right,
            // toward wherever the next card in the row happens to sit), every
            // other card needs to clear out of its way — previously they just
            // stayed put at full opacity, so the focal card visibly flew
            // straight into and overlapped its neighbor instead of getting a
            // clean, uncontested exit.
            gsap.set(el, { scale: baseScale, opacity: baseOpacity * (1 - progressBetween(exitProgress, 0, 0.4)), y: baseY });
          }
        });

        CATEGORIES.forEach((cat, i) => {
          const el = categoryRefs.current[i];
          if (!el) return;
          const isActive = CARDS[nearestIndex]?.category.toLowerCase() === cat.toLowerCase();
          gsap.set(el, { opacity: isActive ? 1 : 0.55 });
        });
      };

      gsap.ticker.add(update);

      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: () => `+=${totalDistance}`,
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
    <>
      <a
        href="#discover-end"
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded bg-primary px-3 py-2 text-xs text-primary-foreground focus:translate-y-0"
      >
        Skip Discover section
      </a>
      <p className="sr-only">
        This section scrolls horizontally as you continue scrolling down. Cards are also reachable in order via Tab.
      </p>

      <div
        id="discover"
        ref={sectionRef}
        data-scene="discover"
        className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory"
      >
        <div ref={wordmarkRef} className="pointer-events-none absolute top-1/2 left-[10%] -translate-y-1/2 font-display text-[22vw] leading-none font-medium text-foreground/[0.04]">
          MONTREAL
        </div>

        {/* Nav is 80px tall uncompressed, 64px compressed (see Nav.tsx) — the
            old top-20 (80px) mobile / md:top-12 (48px) desktop offsets left
            this header's "Saturday · Oct 17" label sitting directly under
            the nav at every breakpoint, rendering blurred through its
            frosted-glass compressed state instead of being hidden by it.
            top-28 clears both nav heights with real margin at every width. */}
        <div className="pointer-events-none absolute inset-x-0 top-28 z-10 px-6 md:px-10">
          <p className="text-xs font-semibold tracking-[0.13em] text-coral uppercase">Saturday · Oct 17</p>
          <h2 className="mt-2 font-display text-3xl">What are we doing Saturday?</h2>
          <div className="mt-4 hidden gap-5 text-xs font-medium tracking-[0.08em] uppercase sm:flex">
            {CATEGORIES.map((cat, i) => (
              <span
                key={cat}
                ref={(el) => {
                  categoryRefs.current[i] = el;
                }}
                className="text-muted-foreground transition-colors"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>

        <p ref={cueRef} className="pointer-events-none absolute right-10 bottom-10 z-10 text-xs tracking-wide text-muted-foreground">
          Explore Montreal
        </p>

        <div ref={trackRef} className="flex h-full w-max items-center gap-6 px-6 pt-32 md:px-10 md:pt-24">
          {CARDS.map((card, i) => (
            <div
              key={card.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              style={{ rotate: `${card.rotation}deg` }}
              className={`relative shrink-0 snap-center overflow-hidden rounded-2xl border shadow-lift max-md:w-[82vw] ${card.size} ${
                card.focal ? "border-2 border-coral" : "border-border"
              } ${card.typeOnly ? "flex flex-col justify-center bg-surface p-6" : "bg-surface"}`}
            >
              {card.photo && (
                // eslint-disable-next-line @next/next/no-img-element -- decorative placeholder photography
                <img src={card.photo} alt="" width={680} height={960} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {card.photo && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />}
              {card.focal && (
                // A coral border alone was too easy to miss while panning past
                // five other cards — this needs to read as "already chosen"
                // at a glance, not just on close inspection.
                <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-coral shadow-lift">
                  <Heart className="size-5 fill-white text-white" />
                </span>
              )}
              <div className={card.photo ? "absolute inset-x-0 bottom-0 p-4 text-white" : ""}>
                <p className="text-[10px] font-semibold tracking-[0.1em] uppercase opacity-80">{card.category}</p>
                <p className="mt-1 font-display text-lg">{card.title}</p>
                <p className="mt-1 text-xs opacity-80">{card.meta}</p>
                {card.focal && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] backdrop-blur">Maya ♥</span>
                    <button type="button" className="btn-primary-sm" onClick={() => advanceNarrative(EXIT_DISTANCE)}>
                      + Add to trip
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div id="discover-end" className="sr-only" />
    </>
  );
}
