import type { ReactNode } from "react";

/** Re-mounts on every route change so the CSS route-in animation replays. */
export default function TripRouteTransition({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
