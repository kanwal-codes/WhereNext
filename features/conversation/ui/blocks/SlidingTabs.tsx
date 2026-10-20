"use client";

import React, { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { PHONE_V2 } from "@/lib/phone-v2";

/**
 * A segmented control whose selected pill slides to the chosen tab (shared-layout motion) instead of
 * jumping. Reduced motion: the pill simply moves. daisyUI supplies the tabs box; the pill is the app's primary fill.
 */
export function SlidingTabs<K extends string | number>({ label, items, value, onChange, className, tabClassName }: {
  label: string;
  items: Array<{ key: K; content: ReactNode; label?: string }>;
  value: K;
  onChange: (key: K) => void;
  className?: string;
  tabClassName?: string;
}) {
  const pill = useId();
  const reduce = useReducedMotion();
  return (
    <div role="radiogroup" aria-label={label} className={cn("daisy-tabs daisy-tabs-box isolate", className)}>
      {items.map((item) => {
        const on = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={item.label}
            onClick={() => onChange(item.key)}
            className={cn("daisy-tab relative min-w-0 shrink-0 transition-colors duration-200", on ? cn("text-primary-foreground", PHONE_V2 && "max-lg:text-foreground") : "text-muted-foreground hover:text-foreground", tabClassName)}
          >
            {on && <motion.span layoutId={pill} aria-hidden className={cn("absolute inset-0 rounded-[inherit] bg-primary shadow-sm", PHONE_V2 && "max-lg:bg-coral-soft max-lg:shadow-none")} transition={reduce ? { duration: 0 } : motionTokens.standard} />}
            <span className="relative z-10 flex flex-col items-center gap-0.5">{item.content}</span>
          </button>
        );
      })}
    </div>
  );
}
