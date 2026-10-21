"use client";

/**
 * One motion vocabulary for the whole app, in one import: the tokens, entrances, press feedback, crossfade, sheet and blur-in
 * image live in `components/motion/` and are re-exported here so every screen keeps a single, mockable import path.
 */
export { ease, motionTokens } from "@/components/motion/tokens";
export { Enter, Reveal, Stagger, StaggerItem, WordReveal, useAnimateIn } from "@/components/motion/entrances";
export { Pressable, Tactile } from "@/components/motion/press";
export { ContentSwap } from "@/components/motion/ContentSwap";
export { Sheet } from "@/components/motion/Sheet";
export { BlurImage } from "@/components/motion/BlurImage";
