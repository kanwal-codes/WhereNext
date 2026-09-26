"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BedDouble, Compass, Route, TicketCheck, Utensils, type LucideIcon } from "lucide-react";
import { progressBetween } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

type Document = { kind: "rail" | "hotel" | "event" | "restaurant" | "activity"; label: string; sub: string; icon: LucideIcon; origin: { x: number; y: number }; rotation: number };

const DOCUMENTS: Document[] = [
  // Was "Fri · 3:45 PM" — CinematicTravelScene shows this same booking's
  // actual departure at 8:32 AM Friday ("8:17 AM · leaves in 15 minutes"),
  // same fix as ChaosScene's identical error.
  { kind: "rail", label: "VIA Rail · YTO→YUL", sub: "Fri · 8:32 AM", icon: Route, origin: { x: -280, y: -140 }, rotation: -4 },
  { kind: "hotel", label: "Fairmont Le Château", sub: "Check-in · Fri", icon: BedDouble, origin: { x: 260, y: -180 }, rotation: 3 },
  { kind: "event", label: "Bad Bunny · Bell Centre", sub: "Oct 16 · 8 PM", icon: TicketCheck, origin: { x: -300, y: 160 }, rotation: -2 },
  { kind: "restaurant", label: "Olive et Gourmando", sub: "Table for 4 · 7:30", icon: Utensils, origin: { x: 280, y: 180 }, rotation: 2 },
  { kind: "activity", label: "Pottery Workshop", sub: "Sat · 2:30 PM", icon: Compass, origin: { x: 0, y: -240 }, rotation: -3 },
];

const SATURDAY = [
  ["10:30", "Brunch", "Olive et Gourmando"],
  ["12:00", "Old Montreal", "Explore"],
  ["2:30", "Pottery Workshop", "Booked"],
  ["7:30", "Dinner", "Reservation"],
] as const;

/**
 * Storyboard Frame 10 — Bookings / the deck. Saturday is the front card;
 * every confirmation rises out from behind it as the viewer scrolls, making
 * the itinerary feel like the source of the trip's practical details.
 */
export function BookingsScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const packetRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const headlineFirstRef = useRef<HTMLHeadingElement>(null);
  const headlineSecondRef = useRef<HTMLHeadingElement>(null);
  const docRefs = useRef<(HTMLDivElement | null)[]>([]);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      // cardRef now defaults to opacity-0 in its className (fixing a flash
      // of the full "Saturday" deck at full opacity before the ticker's
      // first tick) — this branch has to explicitly set it back to 1, since
      // nothing else in the reduced-motion path ever did.
      gsap.set(cardRef.current, { scale: 1, opacity: 1 });
      gsap.set(packetRef.current, { opacity: 1 });
      gsap.set(outroRef.current, { opacity: 0 });
      gsap.set(headlineFirstRef.current, { opacity: 0 });
      gsap.set(headlineSecondRef.current, { opacity: 1 });
      docRefs.current.forEach((el) => gsap.set(el, { opacity: 1, scale: 1 }));
      return;
    }

    const ctx = gsap.context(() => {
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.1;
        const p = smoothedRevealRef.current;

        const deckIn = progressBetween(p, 0.06, 0.16);
        const textExit = progressBetween(p, 0.97, 0.985);
        const outro = progressBetween(p, 0.985, 1);
        const deckExit = outro;
        gsap.set(packetRef.current, {
          opacity: progressBetween(p, 0.03, 0.13) * (1 - deckExit),
          scale: 0.97 + progressBetween(p, 0.03, 0.13) * 0.03,
        });
        gsap.set(cardRef.current, {
          scale: (0.78 + deckIn * 0.22) * (1 - deckExit * 0.08),
          opacity: deckIn * (1 - deckExit),
        });
        gsap.set(outroRef.current, { opacity: outro });
        const firstIn = progressBetween(p, 0.72, 0.79);
        const firstOut = progressBetween(p, 0.81, 0.85);
        gsap.set(headlineFirstRef.current, {
          opacity: firstIn * (1 - firstOut),
          y: (1 - firstIn) * 18 - firstOut * 10,
        });
        const secondIn = progressBetween(p, 0.85, 0.91);
        const secondEmphasis = progressBetween(p, 0.87, 0.94);
        gsap.set(headlineSecondRef.current, {
          opacity: secondIn * (1 - textExit),
          y: (1 - secondIn) * 18,
          color: `color-mix(in oklch, var(--muted-foreground) ${(1 - secondEmphasis) * 100}%, var(--foreground))`,
        });

        DOCUMENTS.forEach((doc, i) => {
          const el = docRefs.current[i];
          if (!el) return;
          const releaseStart = 0.18 + i * 0.09;
          const release = progressBetween(p, releaseStart, releaseStart + 0.16);
          const exit = outro;
          const compact = window.innerWidth < 768;
          const x = doc.origin.x * release * (compact ? 0.48 : 1);
          const y = doc.origin.y * release * (compact ? 0.58 : 1) - 112 * 4 * release * (1 - release);
          gsap.set(el, {
            x,
            y,
            rotate: doc.rotation * release,
            scale: 0.72 + release * 0.28,
            opacity: release * (1 - exit),
          });
        });
      };

      gsap.ticker.add(update);
      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "+=4000",
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
    <div ref={sectionRef} data-scene="bookings" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div ref={outroRef} className="pointer-events-none absolute inset-0 z-0 bg-[#171717] opacity-0" />
      <div ref={packetRef} className="pointer-events-none absolute inset-0 grid place-items-center px-5 opacity-0 md:justify-items-end md:pr-[6vw]">
        <div className="relative h-[min(42rem,72dvh)] w-full max-w-[42rem] overflow-hidden rounded-[2rem] border border-border bg-surface shadow-lift">
          <div className="absolute inset-x-6 top-5 flex items-center justify-between border-b border-border pb-4 md:inset-x-8">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-coral uppercase">Travel file</p>
              <p className="mt-1 font-display text-xl tracking-[-0.03em]">Montreal, confirmed.</p>
            </div>
            <p className="text-right text-xs text-muted-foreground">Oct 16-19<br />Four friends</p>
          </div>

          {DOCUMENTS.map((doc, i) => {
        const Icon = doc.icon;
        return (
          <div key={doc.label} className="absolute top-1/2 left-1/2" style={{ translate: "-50% -50%" }}>
            <div
              ref={(el) => {
                docRefs.current[i] = el;
              }}
              data-booking-doc={doc.kind}
              className={`opacity-0 shadow-lift ${
                doc.kind === "rail"
                  ? "w-56 rounded-lg bg-primary p-4 text-primary-foreground"
                  : doc.kind === "event"
                    ? "w-52 rounded-xl border border-coral bg-coral p-4 text-white"
                    : doc.kind === "activity"
                      ? "w-44 rounded-xl border-2 border-dashed border-coral bg-coral-soft p-3"
                      : doc.kind === "hotel"
                        ? "w-48 overflow-hidden rounded-2xl border border-border bg-surface"
                        : "w-52 overflow-hidden rounded-2xl border border-border bg-surface"
              }`}
            >
              {doc.kind === "hotel" && <div className="h-14 bg-cover bg-center" style={{ backgroundImage: "url(/design/place-hotel.jpg)" }} />}
              {doc.kind === "restaurant" && <div className="h-16 bg-cover bg-center" style={{ backgroundImage: "url(/design/place-cafe.jpg)" }} />}
              <div className={doc.kind === "hotel" || doc.kind === "restaurant" ? "p-3" : ""}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`grid size-7 place-items-center rounded-lg ${doc.kind === "rail" || doc.kind === "event" ? "bg-white/15" : "bg-coral-soft text-coral"}`}>
                    <Icon className="size-3.5" strokeWidth={1.8} />
                  </span>
                  {doc.kind === "rail" && <span className="text-[9px] font-semibold tracking-[0.18em]">BOARDING PASS</span>}
                  {doc.kind === "event" && <span className="text-[9px] font-semibold tracking-[0.18em]">ADMIT ONE</span>}
                </div>
                <p className="truncate text-xs font-medium">{doc.label}</p>
                <p className={`truncate text-[11px] ${doc.kind === "rail" ? "text-primary-foreground/65" : doc.kind === "event" ? "text-white/70" : "text-muted-foreground"}`}>{doc.sub}</p>
                {doc.kind === "event" && <div className="mt-3 border-t border-dashed border-white/30 pt-2 font-mono text-[9px] tracking-[0.22em] text-white/70">BELL CENTRE · MTL</div>}
              </div>
            </div>
          </div>
        );
          })}

          <div className="pointer-events-none absolute inset-0 grid place-items-center pt-8">
            <div ref={cardRef} className="w-56 rounded-2xl border border-border bg-surface p-4 opacity-0 shadow-lift">
          <div className="mb-3 flex items-end justify-between border-b border-border pb-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-coral uppercase">Saturday</p>
              <p className="mt-0.5 font-display text-lg">Oct 17</p>
            </div>
            <span className="rounded-full bg-coral-soft px-2 py-1 text-[9px] font-semibold text-coral">4 plans</span>
          </div>
          <div className="space-y-2">
            {SATURDAY.map(([time, item, detail]) => (
              <div key={item} className="grid grid-cols-[2.25rem_0.5rem_1fr] items-start gap-1">
                <span className="pt-0.5 text-[10px] text-muted-foreground">{time}</span>
                <span className="mt-1.5 size-1.5 rounded-full bg-coral" />
                <div>
                  <p className="font-display text-xs">{item}</p>
                  <p className="text-[10px] text-muted-foreground">{detail}</p>
                </div>
              </div>
            ))}
          </div>
            </div>
          </div>

          <p className="absolute inset-x-0 bottom-6 text-center text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">All in one place</p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[18%] z-10 h-[clamp(3.5rem,6vw,6rem)] px-6 text-center md:top-1/2 md:right-auto md:bottom-auto md:left-[clamp(2rem,8vw,9rem)] md:w-[min(32rem,38vw)] md:-translate-y-1/2 md:px-0 md:text-left">
        <h2 ref={headlineFirstRef} className="absolute top-0 inset-x-0 font-display text-[clamp(2.5rem,5.5vw,5rem)] tracking-[-0.02em] opacity-0">Everything you&rsquo;ll need.</h2>
        <h2 ref={headlineSecondRef} className="absolute top-0 inset-x-0 font-display text-[clamp(2.5rem,5.5vw,5rem)] tracking-[-0.02em] opacity-0">Right when you&rsquo;ll need it.</h2>
      </div>
    </div>
  );
}
