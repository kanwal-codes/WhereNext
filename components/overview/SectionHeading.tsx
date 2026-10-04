import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

/** A chapter title: large display type, with an optional link to the full page on the right. */
export function SectionHeading({ title, count, href, cta }: { title: string; count?: number; href?: string; cta?: string }): ReactNode {
  return (
    <div className="rise flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">{title}</h2>
        {count !== undefined && count > 0 && <span className="daisy-badge daisy-badge-ghost tabular-nums">{count}</span>}
      </div>
      {href && cta && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 pb-1 text-sm font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline">
          {cta}
          <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      )}
    </div>
  );
}
