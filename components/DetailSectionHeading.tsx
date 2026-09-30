import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one section-heading style for a detail view (place, stay, event, ...): plain text, no
 * icon, no accent tick, no secondary corner label. Each of the three detail views had
 * independently grown its own variant of this — a coral tick mark before the first section only,
 * a right-aligned small-caps caption on later sections, an icon-prefixed heading elsewhere —
 * despite it being the same "About"/"Photos"/"Tickets" kind of section everywhere. Centralized
 * here so a fourth detail view can't quietly invent a fourth style.
 */
export function DetailSectionHeading({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <h2 id={id} className={cn("font-display text-xl", className)}>{children}</h2>;
}
