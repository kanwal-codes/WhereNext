"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, Heart } from "lucide-react";
import {
  fadeIn,
  progressBetween,
  smoothStep,
  trackEntrance,
  trackRevisit,
} from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

type Place = {
  category: string;
  title: string;
  meta: string;
  photo: string;
  focus: string; // object-position, keeps each crop on its subject
  fit: readonly [string, string];
  hearts: readonly string[];
};

// Discover shows the whole shortlist at once — four places, no scrolling through them — and the
// point of each card isn't the place, it's that Roam picked it against the brief (4 friends, $900
// each, vegetarian, no museums). The first three are good options only some of the group wanted;
// pottery is the one everybody ♥'d, so it's the one that gets added and carries into Plans Change.
const PLACES: Place[] = [
  {
    category: "Outdoors",
    title: "Mount Royal at golden hour",
    meta: "Free · 20 min walk",
    photo: "/design/discover-mount-royal.jpg",
    focus: "center 62%",
    fit: ["Free, $0 each", "Dry and 18°C on Saturday"],
    hearts: ["M"],
  },
  {
    category: "Live music",
    title: "A late set at MTELUS",
    meta: "Sat 9 PM · Standing room",
    photo: "/design/discover-live-music.jpg",
    focus: "center 55%",
    fit: ["4 tickets still available", "Inside your $900 each"],
    hearts: ["K", "A"],
  },
  {
    category: "Nightlife",
    title: "Rooftop drinks at Le Bain Public",
    meta: "Old Port · 10 min walk",
    photo: "/design/discover-rooftop.jpg",
    focus: "center 45%",
    fit: ["Vegetarian menu", "Open past midnight"],
    hearts: ["A", "M"],
  },
  {
    category: "Activity",
    title: "Pottery Workshop",
    meta: "Sat 2 PM · $42 each",
    photo: "/design/discover-pottery.jpg",
    focus: "center 45%",
    fit: ["Well under budget", "Fits the 2 PM gap"],
    hearts: ["K", "A", "M", "J"],
  },
];
const LAST = PLACES.length - 1;

// Beat sheet, in px of pin scroll. The four cards rise in as the scene arrives (staggered), then
// Roam's checks tick in, then the group's ♥s land. Pottery adds itself to the trip while the other
// three step back, holds ~700px with the confirmation showing, and the scene dissolves so it is
// empty (last 150px) before its pin releases and Plans Change rises in.
const HEARTS_AT = 500;
const ADD = [1350, 1500] as const;
const FOCUS = [1350, 1650] as const;
const EXIT = [2300, 2600] as const;
const D = 2750;
// Revisiting shows pottery added, with the others stepped back.
const RESOLVED = 2000;

/**
 * Storyboard Frame 5 — Discover. The shortlist Roam builds for the group, laid out like the
 * app's own place cards: photo, name, why it fits, who ♥'d it. On a phone the four cards become
 * compact rows so the whole list still fits one screen.
 */
export function DiscoverScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const rowRefs = useRef<(HTMLLIElement | null)[][]>(PLACES.map(() => []));
  const tallyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRef = useRef<HTMLSpanElement>(null);
  const addedRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);
  const enterRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gsap.set([stageRef.current, headerRef.current], { opacity: 1 });
      PLACES.forEach((_, i) => {
        gsap.set(cardRefs.current[i], { opacity: 1 });
        gsap.set(rowRefs.current[i], { opacity: 1 });
        gsap.set(tallyRefs.current[i], { opacity: i === LAST ? 0 : 1 });
      });
      gsap.set([ringRef.current, addedRef.current], { opacity: 1 });
      return;
    }

    const update = () => {
      smoothedRevealRef.current = smoothStep(smoothedRevealRef.current, revealRef.current, 0.12);
      const px = smoothedRevealRef.current * D;
      const w = (a: number, b: number) => progressBetween(px, a, b);
      const enter = enterRef.current;
      const focus = w(FOCUS[0], FOCUS[1]);
      const added = w(ADD[0], ADD[1]);

      gsap.set(stageRef.current, { opacity: 1 - w(EXIT[0], EXIT[1]) });
      const headerIn = progressBetween(enter, 0, 0.5);
      gsap.set(headerRef.current, { opacity: headerIn, y: 16 * (1 - headerIn) });

      PLACES.forEach((_, i) => {
        const cardIn = progressBetween(enter, 0.1 + i * 0.12, 0.6 + i * 0.12);
        const stepBack = i === LAST ? 0 : focus;
        gsap.set(cardRefs.current[i], {
          opacity: cardIn * (1 - 0.55 * stepBack),
          y: 36 * (1 - cardIn),
          scale: (0.97 + 0.03 * cardIn) * (i === LAST ? 1 + 0.03 * focus : 1 - 0.02 * stepBack),
        });
        rowRefs.current[i].forEach((row, r) => {
          const start = 80 + i * 90 + r * 70;
          const rowIn = w(start, start + 220);
          gsap.set(row, { opacity: rowIn, x: 8 * (1 - rowIn) });
        });
        const heartsIn = w(HEARTS_AT + i * 90, HEARTS_AT + i * 90 + 260);
        gsap.set(tallyRefs.current[i], { opacity: i === LAST ? heartsIn * (1 - added) : heartsIn, y: 6 * (1 - heartsIn) });
      });

      gsap.set(ringRef.current, { opacity: focus });
      gsap.set(addedRef.current, { opacity: added });
    };

    gsap.ticker.add(update);
    const revisit = trackRevisit(RESOLVED / D, D, (target) => {
      smoothedRevealRef.current = target;
      fadeIn(sectionRef.current);
    });
    const st = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top top",
      end: `+=${D}`,
      pin: true,
      scrub: true,
      onUpdate: (self) => {
        revealRef.current = revisit(self);
      },
    });
    const entrance = trackEntrance(sectionRef.current!, (value) => {
      enterRef.current = value;
    });

    return () => {
      gsap.ticker.remove(update);
      st.kill();
      entrance.kill();
    };
  }, []);

  return (
    <div
      id="discover"
      ref={sectionRef}
      data-scene="discover"
      className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background"
    >
      <div
        ref={stageRef}
        className="mx-auto flex h-[100dvh] max-w-7xl flex-col justify-start gap-4 px-5 pt-[4.75rem] pb-3 md:justify-center md:gap-10 md:px-12 md:pt-24 md:pb-10"
      >
        <div ref={headerRef} className="text-center opacity-0">
          <p className="text-xs font-semibold tracking-[0.13em] text-coral uppercase">Saturday · Oct 17</p>
          <h2 className="mt-1.5 font-display text-[clamp(1.75rem,5vw,3.75rem)] leading-[1.02] tracking-[-0.03em]">What are we doing Saturday?</h2>
        </div>

        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-4 md:gap-5">
          {PLACES.map((place, i) => {
            const last = i === LAST;
            return (
              <li
                key={place.title}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="group relative flex flex-row overflow-hidden rounded-3xl border border-border bg-surface opacity-0 shadow-lift md:flex-col"
              >
                <div className="relative aspect-square w-24 shrink-0 overflow-hidden sm:w-28 md:aspect-[4/3] md:w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size card thumbnail */}
                  <img
                    src={place.photo}
                    alt=""
                    width={640}
                    height={480}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 ease-out md:group-hover:scale-105"
                    style={{ objectPosition: place.focus }}
                  />
                  <span className="absolute top-3 left-3 hidden rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-foreground uppercase backdrop-blur md:inline-flex">
                    {place.category}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 md:gap-2 md:p-4">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-coral uppercase md:hidden">{place.category}</p>
                  <h3 className="font-display text-[15px] leading-tight md:text-lg">{place.title}</h3>
                  <p className="hidden text-xs text-muted-foreground md:block">{place.meta}</p>

                  <div className="mt-1 md:mt-2">
                    <ul className="space-y-1 md:space-y-1.5">
                      {place.fit.map((line, r) => (
                        <li
                          key={line}
                          ref={(el) => {
                            rowRefs.current[i][r] = el;
                          }}
                          className={`items-center gap-2 text-xs opacity-0 ${r === 0 ? "flex max-md:[@media(max-height:720px)]:hidden" : "hidden md:flex"}`}
                        >
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-coral-soft text-coral">
                            <Check className="size-2.5" strokeWidth={3} />
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto grid border-t border-border pt-2 text-xs md:pt-3">
                    <div
                      ref={(el) => {
                        tallyRefs.current[i] = el;
                      }}
                      className="flex items-center gap-2 opacity-0 [grid-area:1/1]"
                    >
                      <span className="flex">
                        {place.hearts.map((initial) => (
                          <span
                            key={initial}
                            className="-ml-1.5 grid size-5 place-items-center rounded-full border-2 border-surface bg-primary text-[9px] font-semibold text-primary-foreground first:ml-0 md:size-6 md:text-[10px]"
                          >
                            {initial}
                          </span>
                        ))}
                      </span>
                      <Heart className="size-3.5 shrink-0 fill-coral text-coral" />
                      <span className={last ? "font-medium text-foreground" : "text-muted-foreground"}>{place.hearts.length} of 4</span>
                    </div>
                    {last && (
                      <div ref={addedRef} className="flex items-center gap-1.5 font-medium text-coral opacity-0 [grid-area:1/1]">
                        <Check className="size-3.5 shrink-0" strokeWidth={3} />
                        Added · Sat 2:00 PM
                      </div>
                    )}
                  </div>
                </div>

                {last && <span ref={ringRef} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-coral opacity-0" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
