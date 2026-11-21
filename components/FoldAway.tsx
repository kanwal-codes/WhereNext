import type { ReactNode } from "react";

/** Rows that slide shut (and cannot be tabbed into) while `folded`, so what is left gets the room, e.g. with the keyboard up. The 4px of padding (undone by the negative margin) keeps the clip from shaving the rings and borders of what is inside. */
export function FoldAway({ folded, children }: { folded: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${folded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`} inert={folded}>
      <div className="-m-1 min-h-0 overflow-hidden p-1">{children}</div>
    </div>
  );
}
