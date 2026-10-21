"use client";

import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import type { TripSummary } from "@/packages/contracts/trip-summary";

/** The confirmation before a trip goes: an owner deletes it for everyone, anyone else only leaves it. */
export function DeleteTripSheet({ trip, onCancel, onConfirm }: { trip: TripSummary | null; onCancel: () => void; onConfirm: (trip: TripSummary) => void }) {
  return (
    <Sheet open={!!trip} onClose={onCancel} ariaLabel={trip?.is_owner === false ? "Leave trip" : "Delete trip"} side="center">
      <div className="space-y-4 p-6">
        <div>
          <h3 className="font-display text-xl">{trip?.is_owner === false ? "Leave this trip?" : "Delete this trip?"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {trip && (
              <>
                <span className="font-medium text-foreground">&ldquo;{trip.name}&rdquo;</span>
                {trip.is_owner === false
                  ? " is owned by someone else. Leaving takes it off your list; it stays for the rest of the group."
                  : " and everything in it — itinerary, saved places, decisions — will be removed for everyone on the trip. This can’t be undone."}
              </>
            )}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-accent active:scale-[0.985]"
          >
            Keep trip
          </button>
          <button
            type="button"
            onClick={() => trip && onConfirm(trip)}
            className="btn-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> {trip?.is_owner === false ? "Leave trip" : "Delete trip"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
