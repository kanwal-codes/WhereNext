"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type SwitchOption<K extends string> = {
  key: K;
  label: ReactNode;
  /** A route change instead of local state (Roam / Chat stay independently deep-linkable). */
  href?: string;
  ariaLabel?: string;
  /** Needs an account: stays dimmed (no icon), never becomes the selected segment, and only calls `onChange`. */
  locked?: boolean;
};

/**
 * The one pill switch for the app: Roam / Chat, Discover / Saved, Browse / My trip. The thumb
 * glides to the chosen segment (a shared `layoutId`) instead of cutting, and every instance is
 * the same 40px so the pill never changes size between screens. Solid dark thumb on a flat
 * background; a floating instance (over a map or photo) gets a frosted white thumb instead, so
 * it reads as glass over whatever is underneath rather than a flat cutout.
 */
export function SegmentedSwitch<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
  floating = false,
}: {
  options: ReadonlyArray<SwitchOption<K>>;
  value: K;
  onChange?: (key: K) => void;
  label: string;
  className?: string;
  /** Sits over a map or photo: the same pill, lifted off the ground with a shadow. */
  floating?: boolean;
}) {
  const thumbId = useId();
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label={label} className={cn("inline-flex rounded-full bg-muted p-1 text-sm", floating && "shadow-lift ring-1 ring-black/[0.05]", className)}>
      {options.map((o) => {
        const active = o.key === value && !o.locked;
        const cls = cn(
          "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-5 font-medium whitespace-nowrap transition-colors",
          "max-lg:h-10",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        );
        const inner = (
          <>
            {active && (
              <motion.span
                layoutId={thumbId}
                aria-hidden
                className={cn("absolute inset-0 rounded-full shadow-soft", floating ? "bg-white/70 ring-1 ring-white/60 backdrop-blur-md" : "bg-card")}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
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
