"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Caveat } from "next/font/google";
import { Reveal } from "@/components/landing/story/Reveal";
import { calm, watch } from "@/components/landing/story/scroll";
import { BoardingPass, BrowserTabs, ChatThread, ConcertTicket, FoldedMap, IndexCard, Polaroid, Receipt, StickyNote, WeatherCard } from "@/components/landing/story/desk";

const hand = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand", display: "swap" });

type Piece = {
  w: number; // rem
  h: number;
  from: readonly [number, number, number]; // where it lies in the pile: x, y (rem from the desk's centre), tilt (deg)
  to: readonly [number, number]; // where it settles
  z: number;
  delay: number; // 0..0.3 of the way through the tidy-up
  body: ReactNode;
};

// Wide desk: twelve pieces lie in an overlapping pile, then settle into four neat columns.
const COLS = [-25.5, -8.5, 8.5, 25.5];
const ROWS = [-12.5, 0, 12.5];
const at = (i: number) => [COLS[i % 4], ROWS[Math.floor(i / 4)]] as const;
const WIDE: Piece[] = [
  { w: 14, h: 9.5, from: [-21, -9, -4], to: at(0), z: 2, delay: 0.05, body: <ChatThread /> },
  { w: 15, h: 7.4, from: [-4, -13, 3], to: at(1), z: 1, delay: 0.12, body: <BrowserTabs /> },
  { w: 15, h: 7.4, from: [14, -11, -6], to: at(2), z: 3, delay: 0, body: <BoardingPass /> },
  { w: 15, h: 6.2, from: [26, -4, 5], to: at(3), z: 4, delay: 0.18, body: <ConcertTicket /> },
  { w: 9.4, h: 11.2, from: [-28, 4, -8], to: at(4), z: 5, delay: 0.1, body: <Polaroid photo="/design/place-neighbourhood.jpg" caption="cobblestone streets!" /> },
  { w: 15, h: 10, from: [-10, 1, 2], to: at(5), z: 3, delay: 0.24, body: <FoldedMap /> },
  { w: 9.2, h: 9.2, from: [6, -2, 7], to: at(6), z: 7, delay: 0.06, body: <StickyNote text="WHO HAS THE TICKETS" tilt={-2} /> },
  { w: 9.6, h: 10.8, from: [18, 7, -4], to: at(7), z: 6, delay: 0.2, body: <Receipt /> },
  { w: 9.4, h: 11.2, from: [-19, 12, 6], to: at(8), z: 4, delay: 0.15, body: <Polaroid photo="/design/place-hotel.jpg" caption="where we’re staying?" /> },
  { w: 13, h: 7.6, from: [8, 13, 2], to: at(9), z: 5, delay: 0.02, body: <IndexCard /> },
  { w: 9.4, h: 6.6, from: [-3, 12, -3], to: at(10), z: 8, delay: 0.28, body: <WeatherCard /> },
  { w: 9.2, h: 9.2, from: [28, 12, -9], to: at(11), z: 6, delay: 0.1, body: <StickyNote text="pack a jacket!!" tilt={3} /> },
];

// Narrow desk (phones): six of them, two columns.
const NC = [-7.8, 7.8];
const NR = [-12.5, 0, 12.5];
const nat = (i: number) => [NC[i % 2], NR[Math.floor(i / 2)]] as const;
const NARROW: Piece[] = [
  { ...WIDE[0], from: [-4, -9, -5], to: nat(0), z: 2 },
  { ...WIDE[2], from: [3, -6, 5], to: nat(1), z: 4 },
  { ...WIDE[4], from: [-5, 1, -8], to: nat(2), z: 5 },
  { ...WIDE[6], from: [4, 3, 7], to: nat(3), z: 7 },
  { ...WIDE[7], from: [-3, 11, 4], to: nat(4), z: 3 },
  { ...WIDE[1], from: [5, 12, -4], to: nat(5), z: 6 },
];

function Desk({ pieces, className, base, height, deskRef }: { pieces: Piece[]; className: string; base: number; height: number; deskRef: React.Ref<HTMLDivElement> }) {
  return (
    // The desk's height scales with its pieces (--s is set by the scene), so a narrow window gets a short desk, not a tall empty one.
    <div ref={deskRef} data-desk={base} aria-hidden="true" className={className} style={{ height: `calc(var(--s, 1) * ${height}rem)` }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          className="pc-wrap"
          style={{ "--w": p.w, "--h": p.h, "--x0": p.from[0], "--y0": p.from[1], "--r0": p.from[2], "--x1": p.to[0], "--y1": p.to[1], "--dl": p.delay, zIndex: p.z } as CSSProperties}
        >
          <Reveal className="size-full" offset={i * 5}>
            {p.body}
          </Reveal>
        </div>
      ))}
    </div>
  );
}

const DWELL = 350; // ms the whole pile is held on screen before it settles

/**
 * Scene one of the story: the problem, as a desk. Everything a trip is scattered across lies in a
 * pile of real-looking things. When the pile is on screen and the visitor is reading (not
 * flicking past) it holds for a beat, then settles into rows and the answer appears beneath it.
 * That happens once: scrolling back up finds the desk tidy. If the visitor scrolls on before the
 * beat is over, it settles as the pile leaves, so whatever they scroll back to is the finished
 * state. Reveals are by position (see scroll.ts); only the settle runs on a clock.
 */
export function ProblemScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const wideRef = useRef<HTMLDivElement>(null);
  const narrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const desks = [wideRef.current, narrowRef.current].filter((d): d is HTMLDivElement => !!d);
    if (!section) return;
    const settle = () => {
      section.dataset.settled = "";
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settle();
    }

    const fit = () => {
      for (const desk of desks) {
        const base = Number(desk.dataset.desk); // the width, in rem, this arrangement was drawn for
        const room = desk.parentElement!.clientWidth / 16 - 2; // minus the desk's side padding
        desk.style.setProperty("--s", String(Math.min(1, room / base)));
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    desks.forEach((d) => ro.observe(d.parentElement!));

    let timer = 0;
    const stop = watch(() => {
      if ("settled" in section.dataset) return;
      const desk = desks.find((d) => d.offsetParent);
      if (!desk) return;
      const heading = headingRef.current;
      if (heading && heading.getBoundingClientRect().bottom <= 0) {
        window.clearTimeout(timer);
        timer = 0;
        settle();
        return;
      }
      const rect = desk.getBoundingClientRect();
      const vh = window.innerHeight;
      const centre = rect.top + rect.height / 2;
      if (centre < vh * 0.3) {
        // Scrolled on (or arrived from below): finish it.
        window.clearTimeout(timer);
        timer = 0;
        settle();
      } else if (centre < vh * 0.72 && calm(200)) {
        if (!timer) timer = window.setTimeout(settle, DWELL);
      } else {
        window.clearTimeout(timer);
        timer = 0;
      }
    });
    return () => {
      stop();
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <section ref={sectionRef} data-scene="problem" className={`story-scene ${hand.variable}`}>
      <div className="mx-auto max-w-4xl px-6 text-center">
        <div ref={headingRef}>
          <Reveal as="h2" className="story-h2">
            Every trip starts as a mess.
          </Reveal>
        </div>
        <Reveal as="p" offset={30} className="story-lede mx-auto mt-5 max-w-xl">
          A group chat, six open tabs, a screenshot someone swears they sent. The plan is in everyone’s head and nobody’s hands.
        </Reveal>
      </div>

      <div className="mx-auto mt-14 w-full max-w-[74rem] px-4 sm:mt-16">
        <Desk deskRef={wideRef} pieces={WIDE} base={70} height={43} className="relative hidden sm:block" />
        <Desk deskRef={narrowRef} pieces={NARROW} base={31} height={36} className="relative sm:hidden" />
      </div>

      {/* The answer, once the desk has settled. Its space is kept, so nothing moves when it arrives. */}
      <div aria-hidden="true" className="problem-b pointer-events-none mx-auto mt-10 max-w-2xl px-6 text-center sm:mt-14">
        <p className="font-display text-[clamp(1.9rem,4vw,3.25rem)] leading-[1.05] font-medium tracking-[-0.03em] text-balance">Roam puts it all in one place.</p>
        <p className="story-lede mx-auto mt-3 max-w-md">Dates, tickets, places and who’s paying, gathered into one plan everyone can see.</p>
      </div>
    </section>
  );
}
