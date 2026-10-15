"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Info, X } from "lucide-react";
import { subscribeToasts, type ToastPayload } from "@/lib/application/toast";
import { motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

const ICON: Record<ToastPayload["tone"], { Icon: typeof Check; chip: string }> = {
  success: { Icon: Check, chip: "bg-positive-soft text-positive" },
  error: { Icon: X, chip: "bg-destructive/10 text-destructive" },
  info: { Icon: Info, chip: "bg-muted text-ink-soft" },
};

/** One mount per app shell. The single place any error or status reaches the user. */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduceMotion = useReducedMotion();

  const dismiss = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const map = timers.current;
    const off = subscribeToasts((toast) => {
      setToasts((current) => [...current, toast].slice(-3));
      // A toast with an action (Undo, Retry) stays longer, so there is time to use it.
      map.set(toast.id, setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), toast.action ? 8000 : 4200));
    });
    return () => { off(); map.forEach(clearTimeout); map.clear(); };
  }, []);

  return (
    // Top centre, where the eye already is, on every screen (clear of the notch on a phone).
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { Icon, chip } = ICON[toast.tone];
          return (
            <motion.div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              initial={reduceMotion ? false : { opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.98 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.standard}
              className="pointer-events-auto flex w-[min(26rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-border bg-card/95 py-2.5 pr-2.5 pl-3 text-sm shadow-lift backdrop-blur-xl"
            >
              <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full", chip)}>
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="min-w-0 flex-1 leading-snug text-foreground text-pretty">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                  className="h-8 shrink-0 rounded-full bg-foreground px-3.5 text-xs font-medium text-background transition-opacity hover:opacity-85 active:scale-[0.97]"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
