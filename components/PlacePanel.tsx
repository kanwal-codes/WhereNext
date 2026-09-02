"use client";

import { X } from "lucide-react";
import { PlaceDetailView } from "@/features/places/ui/PlaceDetailView";

/** The full place detail in the chat side rail — same content as `/place/[id]`. */
export function PlacePanel({
  tripId,
  placeId,
  placeName,
  onClose,
}: {
  tripId: string;
  placeId: string;
  placeName: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Place</p>
          <p className="truncate font-display text-sm">{placeName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close place panel"
          className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        <PlaceDetailView tripId={tripId} placeId={placeId} variant="panel" />
      </div>
    </div>
  );
}
