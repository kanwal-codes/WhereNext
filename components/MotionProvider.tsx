"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * One app-wide motion preference. Components can still choose their own timing,
 * but OS-level reduced motion always removes transform-based movement.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
