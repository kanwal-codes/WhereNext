"use client";

import { useLayoutEffect, type ReactNode } from "react";

/**
 * Starts the page at the top. The scroll itself is the browser's own: the story has nothing pinned
 * and nothing to hijack, and the first screen's hand-off is a plain ScrollTrigger scrub.
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

  return <>{children}</>;
}
