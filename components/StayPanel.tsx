"use client";

import { Check, Users, X } from "lucide-react";
import { BlurImage } from "@/components/motion-primitives";
import { StayDetailView } from "@/features/stays/ui/StayDetailView";
import type { StayRoom } from "@/packages/contracts/stay";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** Kept for the full detail view: the Lovable "foggy" image treatment. */
export function FoggyImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative isolate h-44 overflow-hidden rounded-2xl border border-border">
      <BlurImage src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="grain pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-surface/15" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-10 bg-surface [mask-image:linear-gradient(to_top,black,transparent)] backdrop-blur-md" />
    </div>
  );
}

export function RoomRow({
  room,
  locked,
  busy,
  onLock,
  compact,
}: {
  room: StayRoom;
  locked: boolean;
  busy: boolean;
  onLock: (room: StayRoom) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border bg-card p-3", locked ? "border-leaf/40" : "border-border")}>
      <div className="min-w-0">
        <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{room.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {room.maxOccupancy ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> sleeps {room.maxOccupancy}
            </span>
          ) : null}
          {room.boardName && <span>{room.boardName}</span>}
          {room.refundable ? (
            <span className="text-leaf">{room.cancelBefore ? `Free cancellation until ${fmtDay(room.cancelBefore)}` : "Refundable"}</span>
          ) : (
            <span>Non-refundable</span>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className={cn("font-semibold tabular-nums", compact ? "text-xs" : "text-sm")}>
          {formatMoney(room.nightlyAmount, room.currency)}
          <span className="block text-[10px] font-normal text-muted-foreground">/night · {formatMoney(room.totalAmount, room.currency)} total</span>
        </p>
        <button
          type="button"
          onClick={() => onLock(room)}
          disabled={busy || locked}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:opacity-70",
            locked ? "border border-leaf/30 bg-leaf-soft text-leaf" : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {locked ? (
            <>
              <Check className="h-3 w-3" /> Locked
            </>
          ) : (
            "Lock this room"
          )}
        </button>
      </div>
    </div>
  );
}

/** The full hotel detail in the chat side rail — same content as `/stay/[id]`. */
export function StayPanel({
  tripId,
  hotelId,
  hotelName,
  checkin,
  checkout,
  onClose,
}: {
  tripId: string;
  hotelId: string;
  hotelName: string;
  checkin?: string;
  checkout?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Stay</p>
          <p className="truncate font-display text-sm">{hotelName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stay panel"
          className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        <StayDetailView tripId={tripId} hotelId={hotelId} checkin={checkin} checkout={checkout} variant="panel" />
      </div>
    </div>
  );
}
