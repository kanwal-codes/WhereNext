"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Info, X } from "lucide-react";
import { subscribeToasts, type ToastPayload } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

const TONE: Record<ToastPayload["tone"], string> = {
  success: "border-leaf/30 bg-leaf-soft text-leaf",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-border bg-card text-foreground",
};

/** One mount per app shell. Listens on the window toast bus and auto-dismisses. */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const pathname = usePathname();
  // In the conversation, float toasts just above the composer instead of the top corner.
  const nearComposer = Boolean(pathname?.endsWith("/chat"));

  useEffect(() =>
    subscribeToasts((toast) => {
      setToasts((current) => [...current, toast].slice(-3));
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== toast.id)), 3600);
    }), []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[60] flex flex-col gap-2 px-4",
        nearComposer
          ? "inset-x-0 bottom-[4.75rem] items-center"
          : "inset-x-0 top-3 items-center sm:inset-x-auto sm:right-4 sm:items-end",
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: nearComposer ? 12 : -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: nearComposer ? 8 : -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium shadow-lift backdrop-blur",
              TONE[toast.tone],
            )}
          >
            {toast.tone === "success" ? <Check className="h-3.5 w-3.5 shrink-0" /> : toast.tone === "error" ? <X className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
