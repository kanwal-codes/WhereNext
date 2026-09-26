"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { progressBetween } from "@/components/landing/choreography";

gsap.registerPlugin(ScrollTrigger);

// A real back-and-forth, not a single announcement — two people suggest
// options, one gets pushed back on, someone offers an alternative, then the
// viewer sends an actual poll into the same thread (not a separate floating
// card) to settle it. "left" is other people (avatar + name), "right" is
// the viewer's own messages, matching how every real chat app (iMessage,
// WhatsApp) distinguishes sent from received.
const MESSAGES = [
  { side: "left", name: "Maya", initial: "M", text: "something outdoors sunday?" },
  { side: "right", name: "", initial: "", text: "old port bike ride?", reaction: "❤️" },
  { side: "left", name: "Alex", initial: "A", text: "that’s too expensive" },
  { side: "right", name: "", initial: "", text: "botanical garden then?" },
] as const;

const RECOMMENDATIONS = [
  { title: "Old Port bike ride", votes: 3, favorite: true },
  { title: "Botanical Garden", votes: 1, favorite: false },
  { title: "Sunday market", votes: 0, favorite: false },
] as const;

/**
 * Storyboard Frame 9 — Group planning, grounded per Build_Plan step 1: a
 * reaction is a real, working signal but doesn't move anything into the
 * itinerary by itself — a poll (the real `castVote` mechanism) runs and has
 * to win first, and only once it closes does Roam act on the result.
 *
 * Second visual pass: the poll used to live in a separate floating card row
 * duplicating the same three options already named in the chat above it —
 * removed. The poll is now itself a message in the thread (the viewer
 * sending it, same as any other bubble), so the whole scene reads as one
 * continuous conversation instead of "chat panel, then a UI mockup below
 * it." The reaction moved from a standalone card onto the actual message it
 * reacts to, exactly like a real chat app's message reactions. The old
 * two-step "added, then swapped" resolution collapsed into one clear
 * closing card — the nuance (poll winner was over budget, Roam swapped for
 * the free option) reads as a caption rather than a second animated beat.
 */
export function GroupPlanningScene() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reactionRef = useRef<HTMLSpanElement>(null);
  const pollRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const voteCountRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const leadingTagRef = useRef<HTMLSpanElement>(null);
  const resolutionRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(0);
  const smoothedRevealRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      msgRefs.current.forEach((el) => gsap.set(el, { opacity: 1, y: 0 }));
      gsap.set(reactionRef.current, { opacity: 1 });
      gsap.set(pollRef.current, { opacity: 1 });
      barRefs.current.forEach((el, i) => gsap.set(el, { scaleX: RECOMMENDATIONS[i].votes / 3 }));
      voteCountRefs.current.forEach((el) => gsap.set(el, { opacity: 1 }));
      gsap.set(leadingTagRef.current, { opacity: 1 });
      gsap.set(resolutionRef.current, { opacity: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      // Same class of bug as Context's dive, the Finale, and Plans Change
      // (see those files) — raw scrub with no smoothing, packed into a pin
      // too short for a real scroll to give each beat a hold.
      const update = () => {
        smoothedRevealRef.current += (revealRef.current - smoothedRevealRef.current) * 0.12;
        const p = smoothedRevealRef.current;

        const outro = progressBetween(p, 0.95, 0.995);
        gsap.set(contentRef.current, { scale: 1 + p * 0.015, opacity: 1 - outro, y: -8 * outro });

        MESSAGES.forEach((_, i) => {
          // Leave a short arrival beat after Plans Change releases. Starting
          // the first bubble at zero made this scene begin mid-sentence.
          const msgIn = progressBetween(p, 0.1 + i * 0.09, 0.18 + i * 0.09);
          gsap.set(msgRefs.current[i], { opacity: msgIn, y: (1 - msgIn) * 10 });
        });

        // The reaction lands a beat after the message it's reacting to,
        // like someone noticing and tapping the heart a moment later.
        const reactionIn = progressBetween(p, 0.31, 0.37);
        gsap.set(reactionRef.current, { opacity: reactionIn, scale: 0.6 + reactionIn * 0.4 });

        gsap.set(pollRef.current, { opacity: progressBetween(p, 0.53, 0.62), y: (1 - progressBetween(p, 0.53, 0.62)) * 10 });
        const voteFill = progressBetween(p, 0.62, 0.74);
        RECOMMENDATIONS.forEach((rec, i) => {
          gsap.set(barRefs.current[i], { scaleX: (rec.votes / 3) * voteFill });
          gsap.set(voteCountRefs.current[i], { opacity: voteFill });
        });
        gsap.set(leadingTagRef.current, { opacity: progressBetween(p, 0.74, 0.79) });

        // A real pause between the poll settling and Roam acting on it —
        // "once the poll ends" needs a beat of nothing happening, not an
        // instant resolution.
        const resolutionIn = progressBetween(p, 0.82, 0.89);
        gsap.set(resolutionRef.current, { opacity: resolutionIn, y: (1 - resolutionIn) * 10 });
      };

      gsap.ticker.add(update);

      const st = ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        // Was 1500 — same real-scroll-tested fix as the other beat-driven
        // scenes: too short a pin here meant an ordinary scroll could skip
        // clean past individual beats (the reaction, the poll resolving,
        // the swap) instead of letting each one register.
        end: "+=3200",
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
    <div id="groups" ref={sectionRef} data-scene="group-planning" className="relative min-h-[100dvh] scroll-mt-16 overflow-hidden bg-background">
      {/* One continuous thread, no column split, no section labels — the
          poll and its outcome are messages in the same conversation, not a
          separate UI mockup bolted underneath a chat panel. */}
      <div ref={contentRef} className="absolute inset-x-0 top-1/2 mx-auto flex w-full max-w-md -translate-y-1/2 flex-col gap-5 px-6">
        {MESSAGES.map((msg, i) => (
          <div
            key={i}
            ref={(el) => {
              msgRefs.current[i] = el;
            }}
            className={`relative flex max-w-[78%] items-end gap-2 opacity-0 ${msg.side === "right" ? "flex-row-reverse self-end" : "self-start"}`}
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
              {msg.text}
            </div>
            {"reaction" in msg && (
              <span ref={reactionRef} className="absolute -bottom-2 left-2 text-base opacity-0">
                {msg.reaction}
              </span>
            )}
          </div>
        ))}

        <div ref={pollRef} className="w-full max-w-[78%] self-center space-y-2 rounded-2xl border border-border bg-surface p-3 opacity-0 shadow-soft">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Poll</p>
              <p className="text-[10px] text-muted-foreground">Closes tonight</p>
            </div>
            <span ref={leadingTagRef} className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-medium text-coral opacity-0">
              Leading
            </span>
          </div>
          {RECOMMENDATIONS.map((rec, i) => (
            <div key={rec.title} className="flex items-center gap-2 text-xs">
              <span className={`w-28 truncate ${rec.favorite ? "font-medium text-coral" : "text-muted-foreground"}`}>{rec.title}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  ref={(el) => {
                    barRefs.current[i] = el;
                  }}
                  className="h-full origin-left rounded-full bg-coral"
                  style={{ transform: "scaleX(0)" }}
                />
              </span>
              <span
                ref={(el) => {
                  voteCountRefs.current[i] = el;
                }}
                className="w-3 text-right tabular-nums text-muted-foreground opacity-0"
              >
                {rec.votes}
              </span>
            </div>
          ))}
        </div>

        {/* Was bg-coral-soft with a coral border AND coral label text — coral
            on coral, the flat "every card is a pastel tile" look. Every
            other Roam panel on the site (PlansChangeScene's) is a plain
            white card with coral reserved for just the label; matching that
            here instead of inventing a second treatment. */}
        <div ref={resolutionRef} className="mx-auto w-full max-w-[85%] rounded-xl border border-border bg-surface p-4 text-center opacity-0 shadow-lift">
          <p className="text-[10px] font-semibold tracking-wide text-coral uppercase">✦ Roam · Added to Sunday</p>
          <p className="mt-1 font-display text-base">Botanical Garden</p>
          <p className="mt-1 text-xs text-muted-foreground">Old Port bike ride won the poll — swapped for a free option.</p>
        </div>
      </div>
    </div>
  );
}
