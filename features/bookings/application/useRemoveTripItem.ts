"use client";

import { useCallback } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import type { Reservation } from "@/packages/contracts/reservation";

type Decision = { kind: string; value: unknown };
export type RemovableDecision = "stay" | "flight";

/** The stored decision a removal wipes, so an Undo can write it back. */
const stored = (decisions: ReadonlyArray<Decision>, kind: RemovableDecision) =>
  decisions.find((d) => (kind === "stay" ? d.kind === "stay" : d.kind === "transport" && (d.value as { mode?: string } | null)?.mode === "flight")) ?? null;

/**
 * Taking a stay, a flight or a hand-entered reservation off the trip. A removed stay or flight can be put back from the
 * toast (the choice is written again); a reservation is confirmed before it goes, because its attached files go with it.
 * Each call resolves true once it is gone, so the caller can close its own UI.
 */
export function useRemoveTripItem(tripId: string) {
  const { data } = useTripData();
  const current = data?.decisions;

  const removeDecision = useCallback(async (kind: RemovableDecision, name: string): Promise<boolean> => {
    const before = stored((current ?? []) as Decision[], kind);
    try {
      const res = await fetch(`/api/trips/${tripId}/decisions?kind=${kind}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
    } catch {
      notifyToast("Couldn’t remove that. Try again.", "error");
      return false;
    }
    announceWorkspaceChange("decision");
    notifyToast(`${name} removed from your trip.`, "success", before ? {
      label: "Undo",
      onClick: () => {
        void fetch(`/api/trips/${tripId}/decisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: before.kind, value: before.value, idempotencyKey: kind === "stay" ? "stay" : undefined }) })
          .then((r) => { if (!r.ok) throw new Error(); announceWorkspaceChange("decision"); })
          .catch(() => notifyToast("Couldn’t put that back.", "error"));
      },
    } : undefined);
    return true;
  }, [tripId, current]);

  const removeReservation = useCallback(async (reservation: Reservation, onGone: (id: string) => void): Promise<boolean> => {
    try {
      const res = await fetch(`/api/trips/${tripId}/reservations/${reservation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
    } catch {
      notifyToast("Couldn’t remove that. Try again.", "error");
      return false;
    }
    onGone(reservation.id);
    notifyToast(`${reservation.title} removed.`, "success");
    return true;
  }, [tripId]);

  return { removeDecision, removeReservation };
}
