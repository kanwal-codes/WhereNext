"use client";

import React from "react";
import { Check } from "lucide-react";
import { Reveal } from "@/components/motion-primitives";
import type { ChecklistListBlock } from "@/components/TripPanelProvider";
import { checklistKey, itemId, useTicks } from "@/features/conversation/ui/blocks/ChecklistBlock";
import { surface, type } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import { BigFigure, PanelHeader } from "./PanelHeader";

/** The whole checklist, one group after another, with the same ticks the card in the chat keeps (kept on this device, per list). */
export function ChecklistDetail({ block, tripId }: { block: ChecklistListBlock; tripId: string }) {
  const groups = block.groups.filter((group) => group.items.length > 0);
  const { ticked, toggle } = useTicks(checklistKey(tripId, groups));
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const done = groups.reduce((sum, g, gi) => sum + g.items.filter((item) => ticked.has(itemId(gi, item.text))).length, 0);
  const frac = total ? done / total : 0;
  return (
    <div className="space-y-6 p-4 pb-8">
      <Reveal delay={0} y={10}>
        <section aria-label="Progress" className={cn(surface, "space-y-4 p-5")}>
          <PanelHeader eyebrow={["Checklist", `${groups.length} group${groups.length === 1 ? "" : "s"}`]} sub={done === total && total > 0 ? "Everything is ticked off. You are ready." : `${total - done} left. Ticks stay on this device.`}>
            <BigFigure text={`${done} of ${total}`} />
          </PanelHeader>
          <div role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-coral transition-[width] duration-500 ease-out" style={{ width: `${frac * 100}%` }} />
          </div>
        </section>
      </Reveal>
      {groups.map((group, gi) => (
        <Reveal key={group.title} delay={0.05 + gi * 0.04} y={10}>
          <section aria-label={group.title} className="space-y-3">
            <h3 className={type.section}>{group.title}</h3>
            <ul className={cn(surface, "divide-y divide-border")}>
              {group.items.map((item) => {
                const id = itemId(gi, item.text);
                const on = ticked.has(id);
                return (
                  <li key={id}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3.5 px-4 py-3">
                      <input type="checkbox" checked={on} onChange={() => toggle(id)} className="peer sr-only" />
                      <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-input text-background transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                        {on && <Check className="size-3.5" strokeWidth={2.6} />}
                      </span>
                      <span className={cn(type.body, "min-w-0 transition-colors", on ? "text-muted-foreground" : "text-foreground")}>
                        <span className={cn(on && "line-through decoration-muted-foreground/40")}>{item.text}</span>
                        {item.why ? <span className={cn(type.meta, "block")}>{item.why}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>
      ))}
    </div>
  );
}
