"use client";

import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";
import { RoamMark } from "@/features/roam/ui/RoamMark";

/** Ways into an empty conversation: three things nearly every trip starts with. */
const STARTERS = ["Plan my first day", "Where should we stay?", "What will this cost?"] as const;

/** The opening of an empty conversation: the mark, the line, and a few ways in. */
export function ConversationHero({ disabled, onStarter }: { disabled: boolean; onStarter: (text: string) => void }) {
  return (
    <div className="pt-2 pb-2 text-center">
      {/* The opening shot: the mark, the line, the explanation, then a few ways in, each a beat apart. */}
      <Reveal y={8}>
        <RoamMark state="idle" size={112} label="Roam" className="mx-auto block text-foreground" />
      </Reveal>
      <Reveal delay={0.12} y={12}>
        <h2 className="mt-5 font-display text-3xl font-medium tracking-[-0.03em] text-balance">Where shall we begin?</h2>
      </Reveal>
      <Reveal delay={0.2} y={10}>
        <p className="mx-auto mt-3 max-w-md text-body leading-relaxed text-ink-soft text-pretty">
          No forms. Tell me as much or as little as you like — I&rsquo;ll keep the trip details organised and open a
          proper view when something is easier to see than to describe.
        </p>
      </Reveal>
      <Stagger delay={0.34} gap={0.07} className="mt-6 flex flex-wrap justify-center gap-2">
        {STARTERS.map((starter) => (
          <StaggerItem key={starter}>
            <button type="button" disabled={disabled} onClick={() => onStarter(starter)} className="btn-chip h-9 px-4 text-sm disabled:opacity-50">
              {starter}
            </button>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
