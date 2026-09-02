"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const ease = [0.22, 0.61, 0.36, 1] as const;
export const spring = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.9 };

/**
 * Entrance animations are JS/RAF-driven — a tab that loads in the background would
 * otherwise leave `initial` (opacity 0) content stuck invisible until focus, and
 * SSR would ship a hidden first paint. So: render content plain and visible on the
 * server and first client paint, then upgrade to the motion entrance once we know
 * we're in a live, visible document.
 */
function useAnimateIn(): boolean {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduce || typeof document === "undefined") return;
    if (!document.hidden) {
      setOn(true);
      return;
    }
    const onVis = () => {
      if (!document.hidden) {
        setOn(true);
        document.removeEventListener("visibilitychange", onVis);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reduce]);
  return on;
}

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
  if (!on) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
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
  if (!on) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
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
  const on = useAnimateIn();
  if (!on) return <div className={className}>{children}</div>;
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

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, ease }}
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
            <span className="inline-block overflow-hidden align-bottom">
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
            {i < words.length - 1 ? "\u00a0" : ""}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/** Press + hover feedback for buttons, cards and links. */
export function Tactile({
  children,
  className,
  lift = 2,
  ...rest
}: { children: ReactNode; className?: string; lift?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Image that resolves out of a soft blur instead of popping in. */
export function BlurImage({
  src,
  alt,
  className,
  ...rest
}: { src: string; alt: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative, arbitrary sources
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        "transition-[filter,opacity,transform] duration-700 ease-out",
        loaded ? "scale-100 opacity-100 blur-0" : "scale-[1.03] opacity-0 blur-xl",
        className,
      )}
      {...rest}
    />
  );
}
