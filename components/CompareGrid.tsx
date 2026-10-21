"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { CompareEntry } from "@/components/TripPanelProvider";
import { distanceLabel, type Anchor } from "@/components/tripPanelLogic";
import { cn } from "@/lib/utils";
import { Badge, controlGhost } from "@/features/conversation/ui/blocks/ui";

const KIND_LABEL: Record<CompareEntry["kind"], string> = { place: "Place", stay: "Stay", event: "Event", route: "Route" };

export function CompareGrid({ list, anchor, onRemove }: { list: CompareEntry[]; anchor: Anchor; onRemove: (id: string) => void }) {
  // "Lowest" / "Top" only make sense when every card is the same kind.
  const uniform = list.every((e) => e.kind === list[0]?.kind);
  const bestPrice = uniform ? Math.min(...list.map((e) => e.attrs.priceValue ?? Infinity)) : NaN;
  const bestRating = uniform ? Math.max(...list.map((e) => e.attrs.ratingValue ?? -Infinity)) : NaN;

  const ALL_ROWS: Array<{ label: string; has: (e: CompareEntry) => boolean; get: (e: CompareEntry) => ReactNode }> = [
    { label: "Type", has: () => true, get: (e) => e.attrs.detail ?? KIND_LABEL[e.kind] },
    {
      label: "Price",
      has: (e) => e.attrs.price != null,
      get: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {e.attrs.price ?? "—"}
          {e.attrs.priceValue != null && e.attrs.priceValue === bestPrice && Number.isFinite(bestPrice) && <Badge tone="positive">Lowest</Badge>}
        </span>
      ),
    },
    {
      label: "Rating",
      has: (e) => e.attrs.rating != null,
      get: (e) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {e.attrs.rating ?? "—"}
          {e.attrs.ratingValue != null && e.attrs.ratingValue === bestRating && Number.isFinite(bestRating) && <Badge tone="brand">Top</Badge>}
        </span>
      ),
    },
    { label: "When", has: (e) => e.attrs.when != null, get: (e) => e.attrs.when ?? "—" },
    { label: anchor ? `From ${anchor.name}` : "From your stay", has: (e) => Boolean(anchor) && e.attrs.lat != null && e.attrs.lng != null, get: (e) => distanceLabel(e, anchor) },
    { label: "Address", has: (e) => e.attrs.address != null, get: (e) => e.attrs.address ?? "—" },
  ];
  // A row that is a dash for every option adds noise, not information.
  const ROWS = ALL_ROWS.filter((row) => list.some(row.has));

  if (list.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Pick a few cards to compare — the Compare button is on every place, stay and event.</p>;
  }

  return (
    <div className="overflow-x-auto overscroll-x-contain scrollbar-slim">
      <div className="grid gap-x-3" style={{ gridTemplateColumns: `5.5rem repeat(${list.length}, minmax(9.5rem, 1fr))` }}>
        <div />
        {list.map((e) => (
          <div key={e.id} className="relative rounded-2xl border border-border bg-card p-3">
            <button type="button" onClick={() => onRemove(e.id)} aria-label={`Remove ${e.name}`} className={cn(controlGhost, "absolute top-1 right-1 size-7")}>
              <X className="size-3.5" />
            </button>
            <p className="pr-6 font-display text-base font-semibold leading-tight">{e.name}</p>
            {e.subtitle && <p className="mt-1 text-xs text-muted-foreground">{e.subtitle}</p>}
            {e.href && (
              <Link href={e.href} className="relative mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
                Open <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
        ))}
        {ROWS.map((row, i) => (
          <div key={row.label} className="col-span-full grid grid-cols-subgrid">
            <div className={cn("flex min-h-12 items-center border-t border-transparent pr-2 text-xs font-medium leading-5 text-muted-foreground", i === 0 && "mt-3")}>{row.label}</div>
            {list.map((e) => (
              <div key={e.id + row.label} className={cn("flex min-h-12 items-center border-t border-border text-sm leading-5", i === 0 && "mt-3")}>
                {row.get(e)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
