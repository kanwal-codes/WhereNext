"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

export type PickerOption<K extends string> = { key: K; label: ReactNode; sub?: ReactNode; /** Something before the label: an icon, a day number. */ lead?: ReactNode };

/** One row of a picker: grey with a coral check when it is the chosen one, 64px with a detail line, 56px without. */
export function PickerRow({ on, lead, label, sub, onClick }: { on: boolean; lead?: ReactNode; label: ReactNode; sub?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={cn("flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-colors active:bg-muted", sub ? "min-h-16" : "min-h-14", on && "bg-muted")}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className={cn("block font-display text-base", on ? "font-semibold" : "font-medium")}>{label}</span>
        {sub && <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{sub}</span>}
      </span>
      {on && <Check className="size-5 shrink-0 text-coral" aria-hidden />}
    </button>
  );
}

/**
 * One value from a short list, in a bottom sheet: the way a view, a sort order, a city or a day is chosen. The chosen row is grey with a coral
 * check; picking a row closes the sheet, so there is no footer. Rows are 64px with a detail line, 56px without. See DESIGN.md, "Selected states".
 */
export function PickerSheet<K extends string>({ open, onClose, title, ariaLabel, options, value, onPick }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  ariaLabel: string;
  options: ReadonlyArray<PickerOption<K>>;
  value: K | null | undefined;
  onPick: (key: K) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} side="bottom" ariaLabel={ariaLabel} padded className="max-h-[78dvh]">
      <p className="px-2 pb-2 pt-1 font-display text-xl font-medium tracking-[-0.02em]">{title}</p>
      <ul className="scrollbar-slim grid min-h-0 flex-1 gap-1.5 overflow-y-auto overscroll-contain">
        {options.map((o) => {
          const on = o.key === value;
          return (
            <li key={o.key}>
              <PickerRow on={on} lead={o.lead} label={o.label} sub={o.sub} onClick={() => { onPick(o.key); onClose(); }} />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
