"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  DollarSign,
  Landmark,
  TicketCheck,
  Users,
  Utensils,
} from "lucide-react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { startTrip } from "@/components/landing/choreography";
import { AppFrame } from "@/components/landing/story/AppFrame";
import { Reveal } from "@/components/landing/story/Reveal";
import { calm, watch } from "@/components/landing/story/scroll";

const MESSAGE =
  "Four of us want Montreal, Oct 16–19. Bad Bunny’s on the 16th. $900 each, one vegetarian, no museums.";

const CONSTRAINTS = [
  { label: "4 friends", icon: Users },
  { label: "$900 each", icon: DollarSign },
  { label: "Vegetarian", icon: Utensils },
  { label: "No museums", icon: Landmark },
] as const;

/**
 * Scene two: the product's first move. One messy message is typed, Roam answers, and the brief
 * it understood appears. It plays once when the scene arrives; every element is laid out from the
 * start (hidden, not absent) so nothing shifts while it runs.
 */
export function SayItOnceScene() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const typed = MESSAGE.length;
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    return watch(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top < vh * 0.55 && rect.bottom > vh * 0.45 && calm(250)) {
        setSeen(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!seen) return;
    setStage(2);
    const timer = window.setTimeout(() => setStage(3), 600);
    return () => window.clearTimeout(timer);
  }, [seen]);

  const done = typed >= MESSAGE.length;

  return (
    <section data-scene="say-it-once" className="story-scene">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="text-center lg:text-left">
          <Reveal as="h2" className="story-h2">
            Say it once.
            <br />
            Roam gets it.
          </Reveal>
          <Reveal
            as="p"
            offset={30}
            className="story-lede mx-auto mt-5 max-w-md lg:mx-0"
          >
            Describe the trip the way you’d text a friend. Roam turns it into a
            brief: who’s going, when, what it can cost, and what’s off the
            table.
          </Reveal>
          <Reveal className="mt-8" offset={60}>
            <button
              type="button"
              onClick={startTrip}
              className="story-link hit-44"
            >
              Try it with your own trip
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </Reveal>
        </div>

        <Reveal className="mx-auto w-full max-w-xl lg:max-w-none" offset={40}>
          <div ref={frameRef}>
            <AppFrame title="Friend group">
              <div
                aria-hidden="true"
                className="min-h-[27rem] space-y-4 p-4 sm:min-h-[35rem] sm:p-6"
              >
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] leading-relaxed text-primary-foreground">
                  <span className="grid">
                    {/* The full sentence sits invisibly in the same cell, so the bubble is its final size from the first letter. */}
                    <span className="invisible" style={{ gridArea: "1 / 1" }}>
                      {MESSAGE}
                    </span>
                    <span style={{ gridArea: "1 / 1" }}>
                      {MESSAGE.slice(0, typed)}
                      <span
                        className={`ml-px inline-block h-4 w-px translate-y-0.5 bg-current ${done ? "opacity-0" : "opacity-80"}`}
                      />
                    </span>
                  </span>
                </div>

                <div
                  className={`flex items-center gap-2.5 transition-opacity duration-500 ${stage >= 1 ? "opacity-100" : "opacity-0"}`}
                >
                  <RoamMark
                    state={stage === 2 ? "settled" : "thinking"}
                    size={32}
                    className="shrink-0 text-[#0b6571]"
                  />
                  <p className="text-[15px] text-ink-soft">
                    {stage >= 2 ? "Got it. Here’s the trip so far." : "Reading your message…"}
                  </p>
                </div>

                <div className="relative">
                  {/* The brief's outline is there from the start, so the card is never an empty white box while it waits. */}
                  <div
                    className={`absolute inset-0 rounded-3xl border-2 border-dashed border-border bg-surface transition-opacity duration-500 ${stage >= 3 ? "opacity-0" : "opacity-60"}`}
                  />
                  <div
                    className={`relative rounded-3xl border border-border bg-surface p-4 transition-[opacity,transform] duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:p-5 ${stage >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl font-medium tracking-[-0.02em]">
                          Montreal
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Oct 16–19 · Four friends
                        </p>
                      </div>
                      <span className="rounded-full bg-coral-soft px-3 py-1 text-xs font-medium text-coral-ink">
                        Ready to shape
                      </span>
                    </div>

                    <div className="relative mt-4 h-28 overflow-hidden rounded-2xl sm:h-32">
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage:
                            "url(/design/place-concert-arena.jpg)",
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                      <div className="absolute inset-x-3.5 bottom-3 flex items-center gap-2.5 text-white">
                        <span className="grid size-7 place-items-center rounded-full bg-white/20 backdrop-blur">
                          <TicketCheck className="size-4" strokeWidth={1.8} />
                        </span>
                        <span>
                          <span className="block text-sm font-medium">
                            Bad Bunny · Oct 16
                          </span>
                          <span className="block text-xs text-white/85">
                            The trip anchor
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {CONSTRAINTS.map(({ label, icon: Icon }, i) => (
                        <span
                          key={label}
                          className={`flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${stage >= 3 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                          style={{
                            transitionDelay:
                              stage >= 3 ? `${350 + i * 110}ms` : "0ms",
                          }}
                        >
                          <Icon
                            className="size-4 text-coral"
                            strokeWidth={1.8}
                          />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </AppFrame>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
