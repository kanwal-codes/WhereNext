import type { ReactNode } from "react";

/** A Roam window as the landing shows it: the product's own chrome, not a device mock-up. */
export function AppFrame({ title, meta, children, className = "" }: { title: string; meta?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[1.75rem] border border-border bg-white shadow-lift ${className}`}>
      <div className="flex h-12 items-center gap-3 border-b border-border px-4 sm:px-5">
        <span className="font-display text-[15px] font-medium tracking-[-0.01em]">{title}</span>
        {meta && <span className="truncate text-xs whitespace-nowrap text-muted-foreground">{meta}</span>}
        <span className="ml-auto hidden -space-x-1.5 sm:flex" aria-hidden="true">
          {["K", "A", "M", "J"].map((n) => (
            <span key={n} className="grid size-6 place-items-center rounded-full border-2 border-white bg-primary text-[11px] font-semibold text-primary-foreground">
              {n}
            </span>
          ))}
        </span>
      </div>
      {children}
    </div>
  );
}
