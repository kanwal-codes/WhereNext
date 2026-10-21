"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { ease, motionTokens } from "@/components/motion/tokens";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/**
 * Whether an entrance should play. Entrances are JS/RAF-driven, so a tab loading in the background would
 * leave `initial` (opacity 0) content stuck invisible, and SSR must not ship a hidden first paint: false on
 * the server, through hydration, and in a hidden tab, so that content just appears in place.
 *
 * Read synchronously on a client mount. It used to start false everywhere and flip in an effect, and every
 * wrapper below swapped a `div` for a `motion.div` when it flipped: React rebuilt the whole subtree right
 * after it mounted, which doubled the render work as a panel or page opened and ran every effect inside it
 * (fetches included) twice, in production.
 */
export function useAnimateIn(): boolean {
  const reduce = useReducedMotion();
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => false);
  return visible && !reduce;
}

/**
 * The wrappers keep one element type whatever `useAnimateIn` says, so their subtree never remounts. `initial`
 * is read only on mount: content that mounted while it was false (hydration, a hidden tab) stays settled
 * instead of replaying an entrance later.
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const on = useAnimateIn();
  return (
    <motion.div
      className={className}
      initial={on ? { opacity: 0, y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  delay = 0,
  gap = 0.06,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  gap?: number;
}) {
  const on = useAnimateIn();
  return (
    <motion.div
      className={className}
      initial={on ? "hidden" : false}
      animate="shown"
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLMotionProps<"div">) {
  // No `initial` of its own: a parent `Stagger` whose `initial` is false settles its items too.
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * A thing that rises and fades in when it first appears. `live` is false for restored content, which
 * should settle in place rather than replay; `index` staggers siblings (capped, so a long list never lags).
 */
export function Enter({ live = true, index = 0, y = 10, className, children }: { live?: boolean; index?: number; y?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={live && !reduce ? { opacity: 0, y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motionTokens.swap, delay: Math.min(index, 6) * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

/** Headline reveal: words rise in sequence from behind a mask. */
export function WordReveal({
  text,
  className,
  delay = 0,
  as: Tag = "h1",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3" | "p";
}) {
  const on = useAnimateIn();
  const words = text.split(" ");
  if (!on) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className}>
      <motion.span
        className="inline"
        initial="hidden"
        animate="shown"
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
      >
        {words.map((word, i) => (
          <span key={`${word}-${i}`} className="inline-block">
            {/* pad the clip box so descenders (g, y, p) aren't cut with tight line-heights; negative margin keeps layout unchanged */}
            <span className="inline-block overflow-hidden align-bottom pb-[0.22em] -mb-[0.22em]">
              <motion.span
                className="inline-block"
                variants={{
                  hidden: { y: "108%", opacity: 1 },
                  shown: { y: "0%", opacity: 1, transition: { duration: 0.7, ease } },
                }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
