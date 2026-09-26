"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { advanceNarrative, progressBetween } from "@/components/landing/choreography";

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
      // Same class of bug as Context's dive and the Finale (see those files):
      // raw scrub with no smoothing, packed into a pin too short for a real
      // scroll. A real-scroll test here showed the whole scene — message,
      // grayscale, Ask Roam, the Roam panel, the swap, "Plans change." — all
      // resolving in roughly one ordinary wheel scroll, and "Roam keeps up."
      // never appearing at all before the next scene took over.
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.12;
        const p = smoothedRevealRef.current;

        // Was progressBetween(p, -0.04, 0.08) for the first message — with
        // progressBetween's clamp, a negative lower bound doesn't mean "ease
        // in from just before this scene starts," it means the message sits
        // at ~33% opacity for the ENTIRE time p is at its 0 rest state —
        // which is every frame before this scene's own pin engages, while
        // its section is still just scrolling into view under the previous
        // scene (CardJourneyScene's curve). The message was visibly showing
        // through before the curve had even scrolled away. Starting exactly
        // at 0 keeps it fully hidden until this scene's pin actually begins.
        MESSAGES.forEach((_, i) => {
          const msgIn = progressBetween(p, i * 0.1, 0.08 + i * 0.1);
          gsap.set(msgRefs.current[i], { opacity: msgIn, y: (1 - msgIn) * 10 });
        });

        // A real pause before Roam answers, like the poll-then-resolution
        // beat in GroupPlanningScene — an instant reply would read as fake.
        gsap.set(roamCardRef.current, { opacity: progressBetween(p, 0.36, 0.44), y: (1 - progressBetween(p, 0.36, 0.44)) * 10 });

        // The itinerary card was rendered with no opacity gating at all —
        // fully visible from the moment the scene mounted, long before the
        // conversation that's supposed to explain the change had even
        // played out. It now only appears once Roam has actually replied,
        // then it's the one that visibly goes uncertain (grayscale) before
        // the swap — not the other way around.
        const itineraryIn = progressBetween(p, 0.48, 0.54);
        gsap.set(itineraryRef.current, { opacity: itineraryIn, y: (1 - itineraryIn) * 10 });
        gsap.set(oldCardRef.current, { filter: `grayscale(${progressBetween(p, 0.56, 0.61) * 70}%)` });

        const swap = progressBetween(p, 0.64, 0.71);
        gsap.set(oldCardRef.current, { opacity: 1 - swap, scale: 1 - swap * 0.04 });
        gsap.set(newCardRef.current, { opacity: swap });
        gsap.set(dinnerOldRef.current, { opacity: 1 - swap });
        gsap.set(dinnerNewRef.current, { opacity: swap });
        gsap.set(connectorRef.current, { strokeDashoffset: 60 * (1 - swap) });

        // This closing pair used to fade in and out inside a ~450px sliver
        // right at the very end of the pin (0.95-0.99 of the old, shorter
        // range) — on anything faster than a slow deliberate scroll, both
        // headlines blurred past before they were readable, and worse, a
        // hard-enough scroll can blow straight through this trigger's end
        // and unpin the whole section before the smoothed animation even
        // gets there. Every other scene's closing beat holds for a real
        // stretch of scroll distance before releasing (ChaosScene's final
        // headline holds ~1000px, GroupPlanningScene's ~350px) — this one
        // gets the same treatment: "Roam keeps up." now reaches full
        // opacity a third of the way before the pin ends and just holds.
        gsap.set(headline1Ref.current, { opacity: progressBetween(p, 0.74, 0.79) * (1 - progressBetween(p, 0.83, 0.86)) });
        gsap.set(headline2Ref.current, { opacity: progressBetween(p, 0.86, 0.92) });
      };

      gsap.ticker.add(update);

      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        // Was 2800, then 3000 for the extra message beat, then 3400 for the
        // itinerary's own reveal beat, now 4200 to give the closing headline
        // pair a real hold instead of a photo-finish (see the comment above
        // headline1Ref) — same real-scroll logic as the rest of these
        // scenes: each beat needs an actual hold, not a shared sliver.
        end: "+=4200",
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
    <div ref={sectionRef} data-scene="plans-change" className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6">
        {MESSAGES.map((msg, i) => (
          <div
            key={i}
            ref={(el) => {
              msgRefs.current[i] = el;
            }}
            className={`flex max-w-[78%] items-end gap-2 opacity-0 ${msg.side === "right" ? "flex-row-reverse self-end" : "self-start"}`}
          >
            {msg.side === "left" && (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground">
                {msg.initial}
              </span>
            )}
            <div
              className={`rounded-2xl px-4 py-3 text-sm shadow-soft ${
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
          <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-background bg-coral text-[11px] font-semibold text-white">
            ✦
          </span>
          <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm shadow-soft">
            <p className="leading-relaxed">
              I found another workshop 8 minutes away.
              <br />
              Same price. Starts at 2:30.
            </p>
            <button type="button" className="btn-primary-sm mt-3" onClick={() => advanceNarrative(600)}>
              Fix Saturday
            </button>
          </div>
        </div>

        <div ref={itineraryRef} data-plan-block="itinerary" className="flex w-full flex-col items-center gap-4 opacity-0">
          <div className="relative w-full">
            <div ref={oldCardRef} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <span className="text-xs tabular-nums text-muted-foreground">2:00</span>
              <span className="font-display text-sm">Pottery Workshop</span>
            </div>
            <div ref={newCardRef} className="absolute inset-0 grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl border border-coral/30 bg-coral-soft px-4 py-3 opacity-0">
              <span className="text-xs tabular-nums text-coral">2:30</span>
              <span className="font-display text-sm">Pottery Workshop (alt.)</span>
              <span className="text-[11px] text-coral">8 min away</span>
            </div>
          </div>

          <svg className="h-6 w-1" aria-hidden="true">
            <line ref={connectorRef} x1="0.5" y1="0" x2="0.5" y2="24" stroke="var(--border)" strokeWidth={2} strokeDasharray={60} strokeDashoffset={60} />
          </svg>

          <div className="grid w-full grid-cols-[3.5rem_1fr] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="relative text-xs tabular-nums text-muted-foreground">
              <span ref={dinnerOldRef}>7:00</span>
              <span ref={dinnerNewRef} className="absolute inset-0 opacity-0">
                7:30
              </span>
            </span>
            <span className="font-display text-sm">Dinner</span>
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
