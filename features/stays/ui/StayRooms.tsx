"use client";

import { useState } from "react";
import { Check, Users } from "lucide-react";
import { DetailSectionHeading } from "@/components/DetailSectionHeading";
import { ShowMore } from "@/components/DetailKit";
import { Badge, Notice, money, prettyDate, type as T } from "@/features/conversation/ui/blocks/ui";
import type { useStayDetails } from "@/features/stays/application/useStayDetails";
import { cn } from "@/lib/utils";

/** Rooms and rates for the dates: the price, the terms, and the one action a stay panel exists for. */
export function RoomsSection({ s, hotelId }: { s: ReturnType<typeof useStayDetails>; hotelId: string }) {
  const [all, setAll] = useState(false);
  const rooms = s.rooms ?? [];
  const shown = all ? rooms : rooms.slice(0, 3);
  const locked = s.lockedStay && s.lockedStay.hotelId === hotelId ? s.lockedStay : null;
  const dates = s.checkin && s.checkout ? `${prettyDate(s.checkin)} – ${prettyDate(s.checkout)}` : null;
  return (
    <section aria-labelledby="stay-rooms" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <DetailSectionHeading id="stay-rooms">Rooms &amp; rates</DetailSectionHeading>
        {dates && <p className={cn(T.meta, "tabular-nums")}>{dates}{s.nights ? ` · ${s.nights} night${s.nights === 1 ? "" : "s"}` : ""}</p>}
      </div>
      {s.assumedDates && <Notice tone="caution">These are example dates — set your real dates to see accurate rates.</Notice>}
      {s.roomsUnavailable || rooms.length === 0 ? (
        <Notice>No rates came back for these dates. The hotel may be full, or the rates provider didn’t answer — try different dates.</Notice>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {shown.map((room, i) => {
              const isLocked = Boolean(locked && (locked.rateId ? locked.rateId === room.rateId : locked.roomName === room.name));
              return (
                <li key={room.rateId ?? room.offerId ?? `${room.name}-${i}`} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <p className={cn(T.body, "font-medium")}>{room.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {room.boardName && <Badge>{room.boardName}</Badge>}
                        {room.refundable ? (
                          <Badge tone="positive" icon={Check}>{room.cancelBefore ? `Free cancellation until ${prettyDate(room.cancelBefore.slice(0, 10))}` : "Refundable"}</Badge>
                        ) : (
                          <Badge>Non-refundable</Badge>
                        )}
                        {room.maxOccupancy ? <Badge icon={Users}>{room.maxOccupancy} guest{room.maxOccupancy === 1 ? "" : "s"}</Badge> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-semibold leading-tight tabular-nums">{money(room.nightlyAmount, room.currency)}<span className={cn(T.meta, "font-sans font-normal")}> / night</span></p>
                      <p className={cn(T.meta, "tabular-nums")}>{money(room.totalAmount, room.currency)} total{room.taxesAndFees ? ` · incl. ${money(room.taxesAndFees, room.currency)} taxes` : ""}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    {isLocked ? (
                      <Badge tone="positive" icon={Check}>Your stay</Badge>
                    ) : (
                      <button type="button" className="btn-primary-sm" disabled={s.busy} onClick={() => void s.lockRoom(room)}>
                        {s.busy ? "Saving…" : "Choose this room"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {rooms.length > 3 && <ShowMore open={all} onToggle={() => setAll((v) => !v)} more={`Show all ${rooms.length} rooms`} less="Show fewer rooms" />}
          <Notice>Taxes and fees can change at checkout — confirm the total with the hotel when you book.</Notice>
        </>
      )}
    </section>
  );
}
