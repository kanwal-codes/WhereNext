"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Info, X } from "lucide-react";
import { subscribeToasts, type ToastPayload } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

const TONE: Record<ToastPayload["tone"], string> = {
  success: "border-leaf/30 bg-leaf-soft text-leaf",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-border bg-card text-foreground",
};

/** One mount per app shell. The single place any error or status reaches the user. */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // In the conversation, float toasts just above the composer instead of the top corner.
  const nearComposer = Boolean(pathname?.endsWith("/chat"));

  const dismiss = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const map = timers.current;
    const off = subscribeToasts((toast) => {
      setToasts((current) => [...current, toast].slice(-3));
      // A toast with an action (e.g. "Retry") stays until the user acts or closes it.
      if (!toast.action) {
        map.set(toast.id, setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), 3600));
      }
    });
    return () => { off(); map.forEach(clearTimeout); map.clear(); };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[60] flex flex-col gap-2 px-4",
        nearComposer
          ? "inset-x-0 bottom-[calc(4.75rem+var(--tabbar))] items-center lg:bottom-[4.75rem]"
          : "inset-x-0 top-3 items-center sm:inset-x-auto sm:right-4 sm:items-end",
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={reduceMotion ? false : { opacity: 0, y: nearComposer ? 12 : -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: nearComposer ? 8 : -8, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border py-2 pr-2 pl-3.5 text-xs font-medium shadow-lift backdrop-blur",
              TONE[toast.tone],
            )}
          >
            {toast.tone === "success" ? <Check className="h-3.5 w-3.5 shrink-0" /> : toast.tone === "error" ? <X className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                className="ml-1 shrink-0 rounded-full bg-background/70 px-2.5 py-1 font-semibold text-foreground transition-colors hover:bg-background"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
