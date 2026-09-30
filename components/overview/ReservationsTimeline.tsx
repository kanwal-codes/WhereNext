"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, MapPin, Plus } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { KIND_META } from "@/components/overview/ReservationSheet";
import { TripArt, hashString } from "@/components/trips/TripArt";
import { CATEGORY_LABEL, clockLabel, countByCategory, filterByCategory, groupByDate, type Category, type TimelineItem } from "@/lib/trip-reservations";
import { cn } from "@/lib/utils";
import type { Booking } from "@/packages/contracts/booking";

const STATUS: Record<Booking["status"], string> = {
  confirmed: "border-leaf/30 bg-leaf/10 text-foreground",
  pending: "border-border bg-muted text-muted-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const FILTERS: Array<Category | "all"> = ["all", "stay", "travel", "do"];

function nights(item: TimelineItem): number | null {
  if (!item.date || !item.endDate) return null;
  const days = Math.round((new Date(`${item.endDate}T00:00:00`).getTime() - new Date(`${item.date}T00:00:00`).getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

function Thumb({ item }: { item: TimelineItem }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_META[item.kind].icon;
  return (
    <TripArt seed={hashString(item.id)} className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl">
      {item.thumbnail && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- external hotel image from LiteAPI
        <img src={item.thumbnail} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Icon className="relative h-6 w-6 text-foreground/70" />
      )}
    </TripArt>
  );
}

function Row({ item, onOpenBooking, onEdit }: { item: TimelineItem; onOpenBooking: (id: string) => void; onEdit: (item: TimelineItem) => void }) {
  const n = nights(item);
  const dim = item.status === "cancelled" || item.status === "failed";
  const body = (
    <>
      <Thumb item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{KIND_META[item.kind].label}</span>
          {item.status && <span className={cn("daisy-badge h-5 px-2 text-[11px] capitalize", STATUS[item.status])}>{item.status}</span>}
        </span>
        <span className={cn("mt-0.5 block truncate font-display text-xl tracking-tight", dim && "line-through decoration-muted-foreground/50")}>{item.title}</span>
        {item.subtitle && <span className="block truncate text-sm text-muted-foreground">{item.subtitle}</span>}
        <span suppressHydrationWarning className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.time && <span className="tabular-nums">{clockLabel(item.time)}</span>}
          {n && <span className="tabular-nums">{n} {n === 1 ? "night" : "nights"}</span>}
          {item.place && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.place}</span>
            </span>
          )}
          {item.code && <span className="font-mono tracking-wide">Ref {item.code}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end justify-between self-stretch">
        {item.amountLabel ? <span className="text-sm font-medium tabular-nums">{item.amountLabel}</span> : <span />}
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" />
      </span>
    </>
  );
  const cls = "group flex w-full items-stretch gap-4 rounded-3xl border border-border/70 bg-card p-3.5 text-left shadow-soft transition-shadow hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <div className={cn(dim && "opacity-75")}>
      {item.href ? (
        <Link href={item.href} className={cls}>{body}</Link>
      ) : item.reservation ? (
        <button type="button" onClick={() => onEdit(item)} className={cls}>{body}</button>
      ) : item.bookingId ? (
        <button type="button" onClick={() => onOpenBooking(item.bookingId!)} className={cls}>{body}</button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {item.href && item.bookingId && (
        <button type="button" onClick={() => onOpenBooking(item.bookingId!)} className="mt-1.5 ml-4 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Booking details
        </button>
      )}
    </div>
  );
}

/** Every stay, flight, train, tour and dinner in one list: filter chips, then the days in order. */
export function ReservationsTimeline({
  items,
  hasNextUp = false,
  onAdd,
  onOpenBooking,
  onEdit,
}: {
  items: TimelineItem[];
  /** A featured "next up" card sits above, so this list is the rest. */
  hasNextUp?: boolean;
  onAdd: () => void;
  onOpenBooking: (id: string) => void;
  onEdit: (item: TimelineItem) => void;
}) {
  const [filter, setFilter] = useState<Category | "all">("all");
  const counts = countByCategory(items);
  const shown = filterByCategory(items, filter);
  const groups = groupByDate(shown);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasNextUp && items.length > 0 && <h3 className="w-full font-display text-2xl tracking-tight">Then</h3>}
        <div role="tablist" aria-label="Filter reservations" className="flex flex-wrap gap-2">
          {FILTERS.map((key) => {
            const on = filter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(key)}
                className={cn(
                  "daisy-btn daisy-btn-sm h-9 rounded-full px-4 font-medium shadow-none",
                  on ? "daisy-btn-neutral border-0" : "border-border bg-card hover:border-foreground/30 hover:bg-accent",
                )}
              >
                {key === "all" ? "All" : CATEGORY_LABEL[key]}
                <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground")}>{counts[key]}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onAdd} className="btn-primary h-10 rounded-full px-5">
          <Plus className="h-4 w-4" /> Add reservation
        </button>
      </div>

      {groups.length === 0 && hasNextUp && filter === "all" ? null : groups.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">Nothing in this group yet.</p>
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.date ?? "undated"} aria-label={group.label} className="grid gap-x-8 gap-y-3 md:grid-cols-[9rem_minmax(0,1fr)]">
              <h3 suppressHydrationWarning className={cn("font-display text-xl tracking-tight md:sticky md:top-6 md:self-start", !group.date && "text-muted-foreground")}>
                {group.label}
              </h3>
              <Stagger className="min-w-0 space-y-3">
                {group.items.map((item) => (
                  <StaggerItem key={item.id}>
                    <Row item={item} onOpenBooking={onOpenBooking} onEdit={onEdit} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
