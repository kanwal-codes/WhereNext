import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page's one other view as a button at the right of the header rail ("Saved (3)", "My stays (1)"; once you are there, the way
 * back). A separate control rather than half of a pill: the page's own view is not a choice between two equals. Desktop only: a phone
 * puts the same thing in its header (`useSetPhoneHeader`).
 */
export function RailButton({ icon, children, onClick, ariaLabel, className }: { icon: ReactNode; children: ReactNode; onClick: () => void; ariaLabel?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn("daisy-btn daisy-btn-outline h-10 min-h-10 gap-2 rounded-full border-border bg-card px-4 text-sm font-medium shadow-none hover:border-foreground/30 hover:bg-accent", className)}
    >
      <span aria-hidden className="grid place-items-center [&>svg]:size-4">{icon}</span>
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
