"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Re-mounts on every route change so the route-in fade replays. On a phone the first server paint is the wide layout (the
 * server cannot know the screen), so the page stays hidden until it has hydrated into the phone layout and only then fades in;
 * without that, every load flashed the desktop page for a moment and then jumped. A stylesheet failsafe reveals it anyway if
 * scripts never arrive.
 */
export default function TripRouteTransition({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <div className={ready ? "route-enter" : "route-gate"}>{children}</div>;
}
