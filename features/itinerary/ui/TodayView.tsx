"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudOff } from "lucide-react";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { readTrip } from "@/lib/client/offline-store";
import { tripDayIndex } from "@/lib/trip-dates";
import { readStayDecision } from "@/packages/contracts/stay";
import type { TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";

type ItineraryRow = { id: string; title: string; day_index: number; position?: number };

export function TodayView({ tripId }: { tripId: string }) {
  const live = useTripDataMaybe()?.data ?? null;
  const [offline, setOffline] = useState<{ data: TripWorkspaceData; savedAt: number } | null>(null);

  useEffect(() => {
    if (live) return;
    void readTrip(tripId).then(setOffline);
  }, [live, tripId]);

  const data = live ?? offline?.data ?? null;
  const isOffline = !live && !!offline;

  const dayIndex = useMemo(() => tripDayIndex(data?.trip.start_date), [data?.trip.start_date]);
  const items = useMemo(() => {
    const rows = ((data?.itinerary ?? []) as ItineraryRow[]).slice();
    if (dayIndex == null) return rows.sort((a, b) => a.day_index - b.day_index || (a.position ?? 0) - (b.position ?? 0));
    return rows.filter((r) => r.day_index === dayIndex).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [data?.itinerary, dayIndex]);

  const stay = useMemo(() => readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>), [data?.decisions]);

  if (!data) {
    return <p className="mx-auto max-w-lg px-5 py-16 text-center text-sm text-muted-foreground">Nothing saved for offline yet. Open this trip while online first.</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-8">
      {isOffline && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <CloudOff className="h-3.5 w-3.5" /> Offline — showing your last saved copy
          {offline ? ` (${new Date(offline.savedAt).toLocaleString()})` : ""}
        </p>
      )}

      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {dayIndex == null ? "Your itinerary" : `Today · Day ${dayIndex}`}
      </p>
      <h1 className="mt-1 font-display text-2xl">{data.trip.name}</h1>

      {stay && (
        <div className="mt-4 rounded-2xl border border-leaf/30 bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-leaf">Your stay</p>
          <p className="mt-0.5 truncate font-medium">{stay.hotelName}</p>
          <p className="truncate text-xs text-muted-foreground">{stay.roomName}</p>
        </div>
      )}

      <ol className="mt-5 space-y-2">
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {dayIndex == null ? "No itinerary items yet." : "Nothing scheduled for today."}
          </li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-sm">{it.title}</p>
              {dayIndex == null && <p className="mt-0.5 text-[11px] text-muted-foreground">Day {it.day_index}</p>}
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
