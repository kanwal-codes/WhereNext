import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The most follow-up suggestions Roam offers at once, wherever it offers them: three is a choice, five is a menu. */
export const MAX_SUGGESTIONS = 3;

/**
 * Suggestion chips, always on one line: they never wrap into a second row. What does not fit scrolls sideways (no scrollbar), and a row that does fit
 * stays where it is put. `bleed` lets the row run to the screen's edge inside a padded sheet, so the chips slide under the edge instead of stopping short of it.
 * This is the one rule for suggestions across the app (Roam's follow-ups, the starters, the answers a question offers); see DESIGN.md.
 */
export function SuggestionRow({ children, bleed = false, center = false, className, label }: { children: ReactNode; bleed?: boolean; center?: boolean; className?: string; label?: string }) {
  return (
    <div className={cn(center && "flex justify-center", className)}>
      <div
        role={label ? "group" : undefined}
        aria-label={label}
        className={cn(
          "no-scrollbar flex max-w-full gap-2 overflow-x-auto overscroll-x-contain [&>*]:shrink-0",
          bleed && "-mx-4 px-4 lg:mx-0 lg:px-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
