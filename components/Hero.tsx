"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Filmic hero: slow Ken Burns drift, scroll parallax, grain + vignette,
 * and the foggy dissolve where the image melts into the page background.
 */
export function Hero({
  image,
  alt,
  className,
  imageClassName,
  children,
  overlayClassName,
}: {
  image: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  overlayClassName?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "14%"]);
  const fog = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.6]);

  return (
    <div ref={ref} className={cn("relative isolate overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-0 -z-10">
        <motion.img
          src={image}
          alt={alt}
          width={1600}
          height={900}
          className={cn("h-full w-full object-cover object-center", imageClassName)}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: reduce ? 1.02 : 1.06, opacity: 1 }}
          transition={{
            opacity: { duration: 1, ease: [0.22, 0.61, 0.36, 1] },
            scale: { duration: 18, ease: "linear" },
          }}
        />
      </motion.div>

      <div className="grain pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className={cn("pointer-events-none absolute inset-0 bg-background/25", overlayClassName)} />
      <motion.div
        style={{ opacity: fog }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/70 to-transparent"
      />
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-16 bg-background [mask-image:linear-gradient(to_top,black,transparent)] backdrop-blur-md" />

      {children}
    </div>
  );
}
