"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BedDouble, Check, MapPin } from "lucide-react";
import { RemoveControl } from "@/components/overview/RemoveControl";
import { BlurImage } from "@/components/motion-primitives";
import { MediaFallback } from "@/features/conversation/ui/blocks/ui";
import { cn } from "@/lib/utils";
import type { MyStay } from "@/features/stays/application/my-stay";

/** A hotel photo that falls back to the same soft stand-in as every other card when it is missing or fails to load (alt text in display type is not a fallback). */
export function StayPhoto({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <MediaFallback icon={BedDouble} className={className} />;
  return <BlurImage src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) : "To be added");

function Cell({ label, value, note, className }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3 sm:px-5", className)}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate font-display text-lg leading-tight tracking-tight tabular-nums sm:text-xl">{value}</dd>
      {note && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/**
 * A stay on the trip, set as a card: its photo with a chip, the name and where it is, then the dates and the price as a
 * ledger. The whole card opens the stay; remove (when the stay can be removed here) is the quiet chip in the corner.
 */
export function MyStayCard({ stay, onRemove }: { stay: MyStay; onRemove?: () => Promise<boolean> }) {
  return (
    <article className="card-host card-lift group relative isolate flex flex-col overflow-hidden rounded-3xl border border-leaf/25 bg-card shadow-soft has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50 sm:flex-row">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_130%_at_0%_0%,color-mix(in_oklab,var(--leaf)_11%,transparent),transparent_62%)]" />

      <div className="relative aspect-[16/9] shrink-0 overflow-hidden sm:aspect-auto sm:w-64 lg:w-72">
        <StayPhoto src={stay.thumbnail} alt="" className="photo-grade absolute inset-0 h-full w-full object-cover" />
        <span className="photo-chip absolute top-3 left-3 gap-1.5">
          <Check className="size-3.5 text-leaf" aria-hidden />
          {stay.badge}
        </span>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-5 p-5 sm:p-6">
        <div className="min-w-0 pr-10">
          <h3 className="font-display text-2xl leading-[1.08] tracking-tight text-balance sm:text-3xl">
            <Link href={stay.href} className="after:absolute after:inset-0 after:z-0 focus-visible:outline-none">
              {stay.name}
            </Link>
          </h3>
          {stay.address && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{stay.address}</span>
            </p>
          )}
          {(stay.note || stay.refundable) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              {stay.note && <span>{stay.note}</span>}
              {stay.refundable && <span className="inline-flex items-center gap-1 text-xs font-medium text-leaf"><Check className="size-3" aria-hidden />Free cancellation</span>}
            </p>
          )}
        </div>

        <div className="flex items-end gap-4">
          {/* Hairlines are the gap showing the border colour through. A phone gets the two dates side by side and the total under them. */}
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-3">
            <Cell label="Check-in" value={day(stay.checkin)} />
            <Cell label="Check-out" value={day(stay.checkout)} note={stay.nights ? `${stay.nights} night${stay.nights === 1 ? "" : "s"}` : undefined} />
            <Cell label="Total" value={stay.total ?? "—"} note={stay.perNight ?? undefined} className="col-span-2 sm:col-span-1" />
          </dl>
          <span aria-hidden className="hidden size-10 shrink-0 place-items-center rounded-full border border-border/70 bg-background/70 text-ink-soft transition-[transform,background-color,color] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:bg-foreground group-hover:text-background sm:grid">
            <ArrowUpRight className="size-4" />
          </span>
        </div>
      </div>

      {onRemove && <RemoveControl label={stay.name} onConfirm={onRemove} className="top-3 right-3" />}
    </article>
  );
}
