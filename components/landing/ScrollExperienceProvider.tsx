"use client";

import { useEffect, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/**
 * Owns scroll-driven camera/choreography for the landing page overhaul
 * (docs/LandingPage_Overhaul/Build_Plan, step 4): GSAP + ScrollTrigger drive
 * per-scene timelines, Lenis only smooths the underlying scroll so those
 * timelines read cleanly. Framer Motion keeps owning discrete UI state
 * elsewhere on the page — the two must never animate the same element.
 *
 * Skips Lenis entirely under prefers-reduced-motion: scenes fall back to
 * native scroll + plain fades (Design_Language spec §39) rather than a
 * reduced-motion-aware smooth-scroll, which is still scroll hijacking.
 */
export function ScrollExperienceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 767px)").matches
    )
      return;

    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
