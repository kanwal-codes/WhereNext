"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { advanceNarrative, fadeIn, progressBetween, smoothStep, trackEntrance, trackRevisit } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

// Was a static "Ask Roam" button sitting on the itinerary card plus a side
// panel that slid in from nowhere — the fix read as a UI mockup bolted onto
// a chat screenshot, not a conversation. Rebuilt as a real thread, same
// pattern as GroupPlanningScene: the sold-out news arrives as a message,
// the viewer asks Roam for another time as their own message (the real
// "Ask Roam about this" mechanism, just voiced as chat instead of a button),
// and Roam's answer is a message in that same thread — not a floating card.
const MESSAGES = [
  { side: "left", name: "Maya", initial: "M", text: "pottery place says they’re sold out for 2pm 😭" },
  { side: "right", name: "", initial: "", text: "@Roam find another timing" },
] as const;

// Beat sheet, in px of pin scroll. Maya's message rises in with the page
// (trackEntrance), then each beat gets room before the next: the @Roam ask,
// a pause before the reply, the itinerary, its wobble, the swap, and finally
// the two closing lines, each with a hold. The scene is kept short: beats sit close
// together, and everything then fades so the section is empty (last 200px) before its pin releases and Bookings rises in.
const D = 3300;
// Revisiting shows the completed thread with "Roam keeps up." held.
const RESOLVED = 2650;
const ASK_IN = [150, 330] as const;
const REPLY_IN = [420, 620] as const;
const ITINERARY_IN = [720, 900] as const;
const WOBBLE = [980, 1130] as const;
const SWAP = [1200, 1400] as const;
const H1_IN = [1480, 1680] as const;
const H1_OUT = [2080, 2280] as const;
const H2_IN = [2280, 2480] as const;
const EXIT = [2880, 3100] as const;

// "Fix Saturday" should show the fix: from the reply it carries the story
// through the swap.
const FIX_DISTANCE = 800;

/**
 * Storyboard Frame 8 — Plans change, grounded per Build_Plan step 1: the
 * product has no live booking-status polling, so the sold-out news arrives
 * as a group-chat message, not an automatic check, and the fix is
 * user-initiated via the real "Ask Roam about this" mechanism. No automatic
 * budget-delta animation (that claim was removed at the same step).
 */
export function PlansChangeScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const itineraryRef = useRef<HTMLDivElement>(null);
  const oldCardRef = useRef<HTMLDivElement>(null);
  const roamCardRef = useRef<HTMLDivElement>(null);
  const newCardRef = useRef<HTMLDivElement>(null);
  const dinnerOldRef = useRef<HTMLSpanElement>(null);
  const dinnerNewRef = useRef<HTMLSpanElement>(null);
  const connectorRef = useRef<SVGLineElement>(null);
  const headline1Ref = useRef<HTMLHeadingElement>(null);
  const headline2Ref = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);
  const enterRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      msgRefs.current.forEach((el) => gsap.set(el, { opacity: 1, y: 0 }));
      gsap.set(itineraryRef.current, { opacity: 1, y: 0 });
      gsap.set(oldCardRef.current, { opacity: 0 });
      gsap.set(roamCardRef.current, { opacity: 1, y: 0 });
      gsap.set(newCardRef.current, { opacity: 1 });
      gsap.set(dinnerOldRef.current, { opacity: 0 });
      gsap.set(dinnerNewRef.current, { opacity: 1 });
      gsap.set(headline1Ref.current, { opacity: 0 });
      gsap.set(headline2Ref.current, { opacity: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      const update = () => {
        smoothedRevealRef.current = smoothStep(smoothedRevealRef.current, revealRef.current, 0.12);
        const px = smoothedRevealRef.current * D;
        const w = (from: number, to: number) => progressBetween(px, from, to);
        const enter = enterRef.current;
        const exit = w(EXIT[0], EXIT[1]);
        const stay = 1 - exit;

        const askIn = w(ASK_IN[0], ASK_IN[1]);
        gsap.set(msgRefs.current[0], { opacity: enter * stay, y: (1 - enter) * 10 });
        gsap.set(msgRefs.current[1], { opacity: askIn * stay, y: (1 - askIn) * 10 });

        // A real pause before Roam answers — an instant reply would read as fake.
        const replyIn = w(REPLY_IN[0], REPLY_IN[1]);
        gsap.set(roamCardRef.current, { opacity: replyIn * stay, y: (1 - replyIn) * 10 });

        // The itinerary only appears once Roam has replied, then it's the one
        // that visibly goes uncertain (grayscale) before the swap.
        const itineraryIn = w(ITINERARY_IN[0], ITINERARY_IN[1]);
        gsap.set(itineraryRef.current, { opacity: itineraryIn * stay, y: (1 - itineraryIn) * 10 });
        gsap.set(oldCardRef.current, { filter: `grayscale(${w(WOBBLE[0], WOBBLE[1]) * 70}%)` });

        const swap = w(SWAP[0], SWAP[1]);
        gsap.set(oldCardRef.current, { opacity: 1 - swap, scale: 1 - swap * 0.04 });
        gsap.set(newCardRef.current, { opacity: swap });
        gsap.set(dinnerOldRef.current, { opacity: 1 - swap });
        gsap.set(dinnerNewRef.current, { opacity: swap });
        gsap.set(connectorRef.current, { strokeDashoffset: 60 * (1 - swap) });

        gsap.set(headline1Ref.current, { opacity: w(H1_IN[0], H1_IN[1]) * (1 - w(H1_OUT[0], H1_OUT[1])) });
        gsap.set(headline2Ref.current, { opacity: w(H2_IN[0], H2_IN[1]) * stay });
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
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} data-scene="plans-change" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 [@media(max-height:760px)]:gap-3 [@media(max-height:760px)]:pb-16 md:[@media(min-height:800px)]:max-w-xl md:[@media(min-height:800px)]:gap-5">
        {MESSAGES.map((msg, i) => (
          <div
            key={i}
            ref={(el) => {
              msgRefs.current[i] = el;
            }}
            className={`flex max-w-[78%] items-end gap-2 opacity-0 ${msg.side === "right" ? "flex-row-reverse self-end" : "self-start"}`}
          >
            {msg.side === "left" && (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-background bg-primary text-[11px] font-semibold text-primary-foreground">
                {msg.initial}
              </span>
            )}
            <div
              className={`rounded-2xl px-4 py-3 text-sm shadow-soft md:[@media(min-height:800px)]:px-5 md:[@media(min-height:800px)]:py-3.5 md:[@media(min-height:800px)]:text-base ${
                msg.side === "right" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-surface"
              }`}
            >
              {msg.text.startsWith("@Roam ") ? (
                <>
                  <span className="text-coral">@Roam</span>
                  {msg.text.slice("@Roam".length)}
                </>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}

        {/* Roam replies in the thread like anyone else — left side, its own
            avatar, same bubble shape as Maya's message — not a separate
            floating card. The itinerary actually changing is its own beat
            underneath the conversation, not folded into the reply itself. */}
        <div ref={roamCardRef} className="flex max-w-[85%] items-end gap-2 self-start opacity-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-background bg-coral text-xs font-semibold text-white">
            ✦
          </span>
          <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm shadow-soft md:[@media(min-height:800px)]:px-5 md:[@media(min-height:800px)]:py-3.5 md:[@media(min-height:800px)]:text-base">
            <p className="leading-relaxed">
              I found another workshop 8 minutes away.
              <br />
              Same price. Starts at 2:30.
            </p>
            <button type="button" className="btn-primary-sm mt-3" onClick={() => advanceNarrative(FIX_DISTANCE)}>
              Fix Saturday
            </button>
          </div>
        </div>

        <div ref={itineraryRef} data-plan-block="itinerary" className="flex w-full flex-col items-center gap-4 opacity-0">
          <div className="relative w-full">
            <div ref={oldCardRef} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 md:[@media(min-height:800px)]:px-5 md:[@media(min-height:800px)]:py-4">
              <span className="text-xs tabular-nums text-muted-foreground">2:00</span>
              <span className="font-display text-sm md:[@media(min-height:800px)]:text-base">Pottery Workshop</span>
            </div>
            <div ref={newCardRef} className="absolute inset-0 grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl border border-coral/30 bg-coral-soft px-4 py-3 opacity-0 md:[@media(min-height:800px)]:px-5 md:[@media(min-height:800px)]:py-4">
              <span className="text-xs tabular-nums text-coral">2:30</span>
              <span className="font-display text-sm md:[@media(min-height:800px)]:text-base">Pottery Workshop (alt.)</span>
              <span className="text-xs text-coral">8 min away</span>
            </div>
          </div>

          <svg className="h-6 w-1" aria-hidden="true">
            <line ref={connectorRef} x1="0.5" y1="0" x2="0.5" y2="24" stroke="var(--border)" strokeWidth={2} strokeDasharray={60} strokeDashoffset={60} />
          </svg>

          <div className="grid w-full grid-cols-[3.5rem_1fr] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 md:[@media(min-height:800px)]:px-5 md:[@media(min-height:800px)]:py-4">
            <span className="relative text-xs tabular-nums text-muted-foreground">
              <span ref={dinnerOldRef}>7:00</span>
              <span ref={dinnerNewRef} className="absolute inset-0 opacity-0">
                7:30
              </span>
            </span>
            <span className="font-display text-sm md:[@media(min-height:800px)]:text-base">Dinner</span>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center">
        <div className="relative mx-auto h-16">
          <h2 ref={headline1Ref} className="absolute inset-x-0 font-display text-[clamp(2.75rem,6.5vw,6.5rem)] tracking-[-0.02em] opacity-0">
            Plans change.
          </h2>
          <h2 ref={headline2Ref} className="absolute inset-x-0 font-display text-[clamp(2.75rem,6.5vw,6.5rem)] tracking-[-0.02em] opacity-0">
            Roam keeps up.
          </h2>
        </div>
      </div>
    </div>
  );
}
