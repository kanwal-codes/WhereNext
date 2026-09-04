"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useAnimateIn } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/**
 * Filmic hero: slow Ken Burns drift, scroll parallax, grain + vignette,
 * and the foggy dissolve where the image melts into the page background.
 *
 * `plain` drops the grain / vignette / flat wash (the "film filter"), keeping
 * only the bottom dissolve for text legibility — used on detail pages where the
 * photo should read clean.
 */
export function Hero({
  image,
  alt,
  className,
  plain = false,
  children,
}: {
  image: string;
  alt: string;
  className?: string;
  plain?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const animateIn = useAnimateIn();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "14%"]);
  const fog = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.15]);

  return (
    <div ref={ref} className={cn("relative isolate overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-0 -z-10">
        {/* The fade/scale-in is rAF-driven — only mount the animated img once the
            document is live and visible, so a background-tab load never leaves the
            hero stuck at opacity 0. Until then, render it plain and visible. */}
        {animateIn ? (
          <motion.img
            src={image}
            alt={alt}
            width={1600}
            height={900}
            fetchPriority="high"
            className="h-full w-full object-cover object-center"
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: reduce ? 1.02 : 1.06, opacity: 1 }}
            transition={{
              opacity: { duration: 1, ease: [0.22, 0.61, 0.36, 1] },
              scale: { duration: reduce ? 0 : 18, ease: "linear" },
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- filmic hero, arbitrary sources
          <img src={image} alt={alt} width={1600} height={900} fetchPriority="high" className="h-full w-full object-cover object-center" />
        )}
      </motion.div>

      {!plain && (
        <>
          <div className="grain pointer-events-none absolute inset-0" />
          <div className="vignette pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 bg-background/25" />
        </>
      )}
      <motion.div
        style={{ opacity: fog }}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent",
          plain ? "h-2/5 via-background/55" : "h-1/2 via-background/70",
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-10 bg-background/70 [mask-image:linear-gradient(to_top,black,transparent)] backdrop-blur-sm" />

      {children}
    </div>
  );
}
