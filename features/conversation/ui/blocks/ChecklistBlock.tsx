"use client";

import React, { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { BlockHeader, surface, type } from "./ui";

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
export function ChecklistBlock({ groups, tripId }: { groups: Groups; tripId: string }) {
  const { ticked, toggle } = useTicks(checklistKey(tripId, groups));
  const reduce = useReducedMotion();
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const done = groups.reduce((sum, g, gi) => sum + g.items.filter((item) => ticked.has(itemId(gi, item.text))).length, 0);
  return (
    <div className={cn(surface, "overflow-hidden")}>
      <BlockHeader
        icon={ListChecks}
        title="Checklist"
        actions={
          <p role="status" className={cn(type.meta, "tabular-nums")}>
            <span className="font-medium text-foreground">{done}</span> of {total}
          </p>
        }
      />
      <div role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1 w-full bg-positive/20">
        <motion.div className="h-full origin-left bg-positive" initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={reduce ? { duration: 0 } : motionTokens.standard} />
      </div>
      <div className="divide-y divide-border">
        {groups.map((group, gi) => {
          const groupDone = group.items.filter((item) => ticked.has(itemId(gi, item.text))).length;
          return (
            <section key={group.title} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={type.title}>{group.title}</h3>
                <span className={cn(type.meta, "tabular-nums")}>{groupDone}/{group.items.length}</span>
              </div>
              <ul className="mt-1">
                {group.items.map((item) => {
                  const id = itemId(gi, item.text);
                  const on = ticked.has(id);
                  return (
                    <li key={id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" checked={on} onChange={() => toggle(id)} className="daisy-checkbox daisy-checkbox-success daisy-checkbox-sm mt-0.5 shrink-0 rounded-md" />
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
      </div>
    </div>
  );
}
