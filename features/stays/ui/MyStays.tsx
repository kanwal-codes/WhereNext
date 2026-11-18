"use client";

import Link from "next/link";
import { BedDouble, Plus } from "lucide-react";
import { MyStayCard } from "@/features/stays/ui/MyStayCard";
import { myStayFromTimeline } from "@/features/stays/application/my-stay";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import type { TimelineItem } from "@/lib/trip-reservations";

/** Every stay on the trip, one card under another in date order (a trip can have several: a second city, a night near the airport). */
export function MyStays({ tripId, items, loading, onRemove, onBrowse }: { tripId: string; items: TimelineItem[]; loading: boolean; onRemove: (item: TimelineItem) => Promise<boolean>; onBrowse: () => void }) {
  if (loading) return <div className="space-y-5"><Skeleton className="h-64 rounded-3xl" /></div>;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={BedDouble}
        title="No stays on this trip yet"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={onBrowse} className="btn-primary h-11 rounded-full px-6">Browse stays</button>
            <Link href={`/trips/${tripId}/bookings`} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent">Add a booking</Link>
          </div>
        }
      >
        Lock a room from Browse and it lands here, or add one you have already booked from Bookings.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-5">
      <ul className="space-y-5">
        {items.map((item) => (
          <li key={item.id} className="settle-in">
            <MyStayCard stay={myStayFromTimeline(item, tripId)} onRemove={item.removal ? () => onRemove(item) : undefined} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onBrowse} className="daisy-btn daisy-btn-outline h-11 rounded-full border-border bg-card px-5 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"><Plus className="size-4" aria-hidden /> Browse more stays</button>
      </div>
    </div>
  );
}
