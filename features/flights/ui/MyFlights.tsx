"use client";

import Link from "next/link";
import { Plane, Search } from "lucide-react";
import { StateMessage, stateButton } from "@/components/StateMessage";
import { RemoveControl } from "@/components/overview/RemoveControl";
import { Skeleton } from "@/components/Skeleton";
import { clockLabel, dayHeading, type TimelineItem } from "@/lib/trip-reservations";

function Cell({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate font-display text-lg leading-tight tracking-tight tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 truncate text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** Every flight on the trip, one card under another in date order: the one saved from Getting around, booked ones, and ones typed into Bookings. */
export function MyFlights({ tripId, items, loading, onRemove, onSearch }: { tripId: string; items: TimelineItem[]; loading: boolean; onRemove: (item: TimelineItem) => Promise<boolean>; onSearch: () => void }) {
  if (loading) return <div className="space-y-4"><Skeleton className="h-44 rounded-3xl" /></div>;
  if (items.length === 0) {
    return (
      <StateMessage
        icon={Plane}
        title="No flights on this trip yet"
        actions={
          <>
            <button type="button" onClick={onSearch} className={stateButton.primary}>Search flights</button>
            <Link href={`/trips/${tripId}/bookings`} className={stateButton.secondary}>Add a booking</Link>
          </>
        }
      >
        Flights you save or book appear here. You can also add one you’ve already booked from Bookings.
      </StateMessage>
    );
  }
  return (
    <div className="space-y-5">
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="settle-in">
            <article className="card-host relative flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className="min-w-0 pr-10">
                <h3 className="font-display text-2xl leading-[1.08] tracking-tight text-balance">{item.title}</h3>
                {item.subtitle && <p className="mt-1.5 text-sm text-ink-soft">{item.subtitle}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70">
                <Cell label="Departs" value={item.date ? dayHeading(item.date) : "To be added"} note={item.time ? clockLabel(item.time) : null} />
                <Cell label="Price" value={item.amountLabel ?? "—"} />
              </dl>
              {item.removal && <RemoveControl label={item.title} onConfirm={() => onRemove(item)} className="top-3 right-3" />}
            </article>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onSearch} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"><Search className="size-4" aria-hidden /> Search more flights</button>
    </div>
  );
}
