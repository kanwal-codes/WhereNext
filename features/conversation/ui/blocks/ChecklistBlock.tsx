"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { PHONE_V2 } from "@/lib/phone-v2";
import { cn } from "@/lib/utils";
import { type, controlSecondary } from "./ui";
import { Widget, WidgetHero, WidgetPill } from "./Widget";

type Groups = Array<{ title: string; items: Array<{ text: string; why?: string }> }>;

/** Which ticks belong to which checklist: the trip plus a short fingerprint of the items, so a regenerated list starts clean. */
export function checklistKey(tripId: string, groups: Groups): string {
  let hash = 5381;
  for (const ch of JSON.stringify(groups.map((g) => [g.title, g.items.map((i) => i.text)]))) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  return `roam-checklist:${tripId}:${(hash >>> 0).toString(36)}`;
}

const itemId = (group: number, text: string) => `${group}:${text}`;

/** Ticks kept on this device (per-viewer, like a paper list); a failing or full store just means they reset. */
function useTicks(key: string) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setTicked(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setTicked(new Set());
    }
  }, [key]);
  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* unavailable */ }
      return next;
    });
  return { ticked, toggle };
}

/** A readiness list you can tick off, with a running "3 of 11". */
export function ChecklistBlock({ groups: given, tripId }: { groups: Groups; tripId: string }) {
  // A group with nothing in it is not drawn.
  const groups = given.filter((group) => group.items.length > 0);
  const { ticked, toggle } = useTicks(checklistKey(tripId, groups));
  const [showAll, setShowAll] = useState(false);
  const reduce = useReducedMotion();
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  if (total === 0) return null;
  const done = groups.reduce((sum, g, gi) => sum + g.items.filter((item) => ticked.has(itemId(gi, item.text))).length, 0);
  const left = total - done;
  // A long list opens its first two groups; the rest are one tap away. The count always covers everything.
  const FOLD = 2;
  const visible = showAll || groups.length <= FOLD + 1 ? groups : groups.slice(0, FOLD);
  const frac = total ? done / total : 0;
  const r = 22, c = 2 * Math.PI * r;
  return (
    <Widget
      glyph="checklist"
      tone="coral"
      eyebrow="Checklist"
      title={left === 0 && total > 0 ? "All set" : left === 1 ? "One thing left" : "Before you go"}
      status={
        <WidgetPill tone={left === 0 && total > 0 ? "sage" : "coral"}>
          <span role="status" className="tabular-nums"><span className="font-semibold">{done}</span> of {total}</span>
        </WidgetPill>
      }
      hero={
        <WidgetHero tone="coral" className="flex items-center gap-4">
          <div role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="relative size-16 shrink-0">
            <svg viewBox="0 0 56 56" className="size-16 -rotate-90" aria-hidden>
              <circle cx="28" cy="28" r={r} fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="7" />
              <motion.circle cx="28" cy="28" r={r} fill="none" stroke="var(--coral-fill)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - frac) }} transition={reduce ? { duration: 0 } : motionTokens.standard} />
            </svg>
            <span className="absolute inset-0 grid place-items-center font-display text-[0.8125rem] font-medium tabular-nums">{done}/{total}</span>
          </div>
          <div className="min-w-0">
            <p className="font-display text-xl leading-tight font-medium tracking-[-0.012em]">{left === 0 && total > 0 ? "Everything is ticked off" : left === total ? "Nothing ticked yet" : "Getting there"}</p>
            <p className={type.meta}>{left === 0 && total > 0 ? "You're ready" : `${left} thing${left === 1 ? "" : "s"} left`}</p>
          </div>
        </WidgetHero>
      }
      foot="Your ticks stay on this device"
    >
      <div className="mt-2 divide-y divide-border">
        {visible.map((group, gi) => {
          const groupDone = group.items.filter((item) => ticked.has(itemId(gi, item.text))).length;
          return (
            <section key={group.title} className="px-4 py-3 @[34rem]:px-[1.125rem]">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={type.title}>{group.title}</h3>
                <span className={cn(type.meta, "tabular-nums")}>{groupDone}/{group.items.length}</span>
              </div>
              <ul className="mt-1 grid gap-x-6 @[34rem]:grid-cols-2">
                {group.items.map((item) => {
                  const id = itemId(gi, item.text);
                  const on = ticked.has(id);
                  return (
                    <li key={id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" checked={on} onChange={() => toggle(id)} className={cn("daisy-checkbox daisy-checkbox-success daisy-checkbox-sm mt-0.5 shrink-0 rounded-md", PHONE_V2 && "max-lg:size-6 max-lg:rounded-full max-lg:border-input max-lg:[--chkbg:var(--foreground)] max-lg:[--chkfg:var(--background)] max-lg:[--input-color:var(--foreground)]")} />
                        <span className={cn(type.body, "min-w-0 transition-colors", on ? "text-muted-foreground" : "text-ink-soft")}>
                          <span className={cn(on && "line-through decoration-muted-foreground/40")}>{item.text}</span>
                          {item.why ? <span className={cn(type.meta, "block")}>{item.why}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {visible.length < groups.length && (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 @[34rem]:px-[1.125rem]">
            <span className={cn(type.meta, "min-w-0 truncate")}>{groups.length - visible.length} more groups · {groups.slice(visible.length).map((g) => g.title).join(", ")}</span>
            <button type="button" onClick={() => setShowAll(true)} className={cn(controlSecondary, "h-9")}>Show all</button>
          </div>
        )}
      </div>
    </Widget>
  );
}
