"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";

export type TripMember = { userId: string; email: string | null; isYou: boolean };

// Live-caught: the Group tab's header badge (GroupMembersBadge) and its message list
// (GroupChatSurface) are always mounted together and both independently called
// `GET /api/trips/:id/members` on mount — two identical network round trips (and two DB
// queries) for the exact same roster, every time that tab loads. A per-tripId in-flight-promise
// cache means whichever of the two mounts second, in the same tick, reuses the first's pending
// request instead of starting its own.
const inFlight = new Map<string, Promise<TripMember[]>>();

function fetchMembers(tripId: string): Promise<TripMember[]> {
  const existing = inFlight.get(tripId);
  if (existing) return existing;
  const promise = fetch(`/api/trips/${tripId}/members`)
    .then((r) => (r.ok ? r.json() : { members: [] }))
    .then((body) => (body.members ?? []) as TripMember[])
    .finally(() => inFlight.delete(tripId));
  inFlight.set(tripId, promise);
  return promise;
}

/** Trip member roster, shared across every simultaneously-mounted consumer — see the module
 *  comment above for the redundant-fetch this was built to fix. */
export function useTripMembers(tripId: string): { members: TripMember[]; loaded: boolean } {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++requestIdRef.current;
    fetchMembers(tripId)
      .then((list) => { if (mine === requestIdRef.current) setMembers(list); })
      .catch(() => { if (mine === requestIdRef.current) setMembers([]); })
      .finally(() => { if (mine === requestIdRef.current) setLoaded(true); });
  }, [tripId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A friend joining via the invite link, a role change, or someone leaving otherwise never
  // reaches another member's already-open group chat / member badge / @mention list — only a
  // full reload picked it up, since this was the one workspace slice with no realtime listener
  // at all (see trip-realtime.ts's TABLE_TO_CHANGE).
  useEffect(() => subscribeWorkspaceChanges((changes) => {
    if (changes.includes("members")) refresh();
  }), [refresh]);

  return { members, loaded };
}
