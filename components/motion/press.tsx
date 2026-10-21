"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { motionTokens } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

/** Press + hover feedback for buttons, cards and links. Honours reduced-motion. */
export function Tactile({
  children,
  className,
  lift = 2,
  ...rest
}: { children: ReactNode; className?: string; lift?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <motion.div className={className} {...rest}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.985 }}
      transition={motionTokens.lift}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * The one tactile primitive for an interactive element (a `<button>`, `<a>`, etc.).
 * Subtle lift on hover, a real 2% squeeze on press. Reduced-motion → nothing.
 * Pass the element type via `as` is not supported — render your control as the child
 * of `<Pressable asChild>` style is also out; instead use `motion.button`/`motion.a`
 * directly where you need the tag, or wrap non-critical controls in this.
 */
export function Pressable({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<"span">) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={cn("inline-flex", className)}
      {...(reduce
        ? {}
        : {
            whileHover: { y: -1 },
            whileTap: { scale: 0.98 },
            transition: motionTokens.fast,
          })}
      {...rest}
    >
      {children}
    </motion.span>
  );
}
