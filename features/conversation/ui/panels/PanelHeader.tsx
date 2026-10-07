import React from "react";
import { cn } from "@/lib/utils";

/** A figure as a headline: the numbers large and light, the units and symbols beside them small ("1 h 20 min", "$120", "5 stops"). */
export function BigFigure({ text, className }: { text: string; className?: string }) {
  return (
    <p aria-label={text} className={cn("flex flex-wrap items-baseline gap-x-1.5 font-display leading-none tracking-[-0.045em] tabular-nums", className)}>
      {text.split(/(\d[\d,.]*)/).map((part, i) => {
        const bit = part.trim();
        if (!bit) return null;
        return /^\d/.test(bit)
          ? <span key={i} className="text-[3.25rem] font-light text-foreground">{bit}</span>
          : <span key={i} className="mr-1.5 text-base font-normal tracking-normal text-muted-foreground">{bit}</span>;
      })}
    </p>
  );
}

/** The top of a detail panel: a small spaced label with coral dots between its parts, the headline, a line under it, and a hairline that fades out. */
export function PanelHeader({ eyebrow, children, sub }: { eyebrow: string[]; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-medium tracking-[0.26em] text-muted-foreground uppercase">
        {eyebrow.map((part, i) => <React.Fragment key={i}>{i > 0 && <span aria-hidden className="mx-1.5 text-coral">·</span>}{part}</React.Fragment>)}
      </p>
      <div className="mt-3">{children}</div>
      {sub && <p className="mt-3 truncate text-sm text-muted-foreground">{sub}</p>}
      <div aria-hidden className="mt-5 h-px w-full bg-gradient-to-r from-coral/70 via-foreground/15 to-transparent" />
    </div>
  );
}
