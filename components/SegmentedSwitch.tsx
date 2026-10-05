"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type SwitchOption<K extends string> = {
  key: K;
  label: ReactNode;
  /** A route change instead of local state (Roam / Chat stay independently deep-linkable). */
  href?: string;
  ariaLabel?: string;
  /** Needs an account: shows a lock, never becomes the selected segment, and only calls `onChange`. */
  locked?: boolean;
};

/**
 * The one pill switch for the app: Roam / Chat, Discover / Saved, My trip / Browse. The white
 * thumb glides to the chosen segment (a shared `layoutId`) instead of cutting, and every instance
 * is the same 40px so the pill never changes size between screens.
 */
export function SegmentedSwitch<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<SwitchOption<K>>;
  value: K;
  onChange?: (key: K) => void;
  label: string;
  className?: string;
}) {
  const thumbId = useId();
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-full bg-muted p-1 text-sm", className)}>
      {options.map((o) => {
        const active = o.key === value && !o.locked;
        const cls = cn(
          "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-5 font-medium whitespace-nowrap transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        );
        const inner = (
          <>
            {active && (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className="absolute inset-0 rounded-full bg-card shadow-soft"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
              {o.locked && <Lock className="h-3 w-3 opacity-60" aria-hidden="true" />}
            </span>
          </>
        );
        return o.href && !o.locked ? (
          <Link key={o.key} href={o.href} prefetch onClick={() => onChange?.(o.key)} aria-current={active ? "page" : undefined} aria-label={o.ariaLabel} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={o.key} type="button" onClick={() => onChange?.(o.key)} aria-pressed={o.locked ? undefined : active} aria-label={o.ariaLabel} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
