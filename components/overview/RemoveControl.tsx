"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/components/motion-primitives";

/**
 * Remove, in two beats: a quiet trash chip that appears when the card is hovered or focused (always there on touch), then
 * the same chip opens into "Remove it?  Remove · Keep". Nothing is deleted by a single stray tap, and no modal is needed.
 * Sits in a `relative card-host` card; `className` places it.
 */
export function RemoveControl({ label, onConfirm, className }: { label: string; onConfirm: () => Promise<unknown>; className?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!armed) return;
    const away = (e: PointerEvent) => { if (!busy && !box.current?.contains(e.target as Node)) setArmed(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setArmed(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [armed, busy]);

  const t = reduce ? { duration: 0 } : motionTokens.fast;
  return (
    <div ref={box} data-armed={armed || undefined} className={cn("card-action absolute z-10", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {armed ? (
          <motion.div key="confirm" role="group" aria-label={`Remove ${label}?`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={t} style={{ transformOrigin: "right center" }} className="photo-chip h-9 gap-2 pr-1 pl-3.5">
            <span className="text-xs">Remove?</span>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={async () => { setBusy(true); const gone = await onConfirm(); if (!gone) { setBusy(false); setArmed(false); } }}
              className="inline-flex h-7 min-w-[4.25rem] items-center justify-center rounded-full bg-destructive px-3 text-xs font-medium text-white transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:opacity-70"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-label="Removing" /> : "Remove"}
            </button>
            <button type="button" disabled={busy} onClick={() => setArmed(false)} className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">Keep</button>
          </motion.div>
        ) : (
          <motion.button key="trigger" type="button" aria-label={`Remove ${label}`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={t} onClick={() => setArmed(true)} className="photo-chip size-9 justify-center p-0 transition-colors hover:text-destructive">
            <Trash2 className="size-4" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
