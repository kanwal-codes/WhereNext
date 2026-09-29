"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BedDouble, Compass, Route, TicketCheck, Utensils, type LucideIcon } from "lucide-react";
import { fadeIn, progressBetween, trackEntrance, trackRevisit } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

type Document = {
  kind: "rail" | "hotel" | "event" | "restaurant" | "activity";
  label: string;
  sub: string;
  icon: LucideIcon;
  position: { x: number; y: number };
  rotation: number;
};

const DOCUMENTS: Document[] = [
  { kind: "rail", label: "VIA Rail · YTO→YUL", sub: "Fri · 8:32 AM", icon: Route, position: { x: -190, y: -118 }, rotation: -4 },
  { kind: "hotel", label: "Fairmont Le Château", sub: "Check-in · Fri", icon: BedDouble, position: { x: 185, y: -120 }, rotation: 3 },
  { kind: "event", label: "Bad Bunny · Bell Centre", sub: "Oct 16 · 8 PM", icon: TicketCheck, position: { x: -190, y: 125 }, rotation: -2 },
  { kind: "restaurant", label: "Olive et Gourmando", sub: "Table for 4 · Fri 10:30 PM", icon: Utensils, position: { x: 190, y: 130 }, rotation: 2 },
  { kind: "activity", label: "Pottery Workshop", sub: "Sat · 2:30 PM", icon: Compass, position: { x: 0, y: -185 }, rotation: -3 },
];

const SATURDAY = [
  ["10:30", "Brunch", "Olive et Gourmando"],
  ["12:00", "Old Montreal", "Explore"],
  ["2:30", "Pottery Workshop", "Booked"],
  ["7:30", "Dinner", "Reservation"],
] as const;

// The scene assembles as it rises into view (heading, then the itinerary,
// then each booking), holds for a real read, then fades so it is empty before
// its pin releases and the dark travel sequence rises in. px of pin scroll.
const D = 1500;
const EXIT = [1100, 1350] as const;
const RESOLVED = 700; // revisiting shows the assembled cluster, held

export function BookingsScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current!;
    const stage = stageRef.current!;
    const items = Array.from(stage.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(items, { autoAlpha: 1, y: 0 });
      return;
    }

    // Heading first, the itinerary next, then the five bookings fan in.
    let doc = 0;
    const windows = items.map((item) => {
      if (item.dataset.reveal === "heading") return [0, 0.5];
      if (item.dataset.reveal === "itinerary") return [0.2, 0.65];
      const start = 0.3 + doc++ * 0.08;
      return [start, start + 0.38];
    });
    const entrance = trackEntrance(section, (enter) => {
      items.forEach((item, i) => {
        const r = progressBetween(enter, windows[i][0], windows[i][1]);
        gsap.set(item, { autoAlpha: r, y: 18 * (1 - r) });
      });
    });

    const revisit = trackRevisit(RESOLVED / D, D, () => fadeIn(section));
    const pin = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: `+=${D}`,
      pin: true,
      onUpdate: (self) => {
        gsap.set(stage, { opacity: 1 - progressBetween(revisit(self) * D, EXIT[0], EXIT[1]) });
      },
    });

    return () => {
      entrance.kill();
      pin.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} data-scene="bookings" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div ref={stageRef} data-bookings-stage className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 md:min-h-[100dvh] md:grid-cols-[minmax(16rem,0.8fr)_minmax(32rem,1.2fr)] md:px-12">
        <h2 data-reveal="heading" className="font-display text-[clamp(3.25rem,6vw,6.25rem)] opacity-0 leading-[0.94] tracking-[-0.035em] text-foreground">
          Everything you need.
        </h2>

        <div data-booking-packet className="pointer-events-none relative mx-auto h-[30rem] w-full max-w-[42rem] origin-center scale-[0.68] sm:h-[34rem] sm:scale-[0.84] md:scale-100">
          {DOCUMENTS.map((doc) => {
            const Icon = doc.icon;
            const isImageCard = doc.kind === "hotel" || doc.kind === "restaurant";

            return (
              <div
                key={doc.label}
                className="pointer-events-auto absolute top-1/2 left-1/2"
                style={{ transform: `translate(calc(-50% + ${doc.position.x}px), calc(-50% + ${doc.position.y}px)) rotate(${doc.rotation}deg)` }}
              >
                <article
                  data-booking-doc={doc.kind}
                  data-reveal="doc"
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
                  <div className={isImageCard ? "p-3" : ""}>
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
                </article>
              </div>
            );
          })}

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <article data-reveal="itinerary" className="pointer-events-auto w-56 rounded-2xl border border-border bg-surface p-4 opacity-0 shadow-lift">
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
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
