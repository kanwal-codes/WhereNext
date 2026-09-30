"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { scrollBridge } from "@/components/landing/choreography";

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
  // A refresh restarts the story from the top: dropping a visitor into the
  // middle of a scene would skip the beats that set it up. Runs before every
  // scene's own effects so nothing measures the restored position.
  useLayoutEffect(() => {
    history.scrollRestoration = "manual";
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navigation?.type !== "reload") return;
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 767px)").matches
    )
      return;

    const lenis = new Lenis({ lerp: 0.1 });
    scrollBridge.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      scrollBridge.lenis = null;
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
