"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { announceWorkspaceChange, type WorkspaceChange } from "@/lib/application/workspace-events";
import { getPublicEnv } from "@/lib/env";

/** Which workspace slice a change to each published table maps to. */
const TABLE_TO_CHANGE: Record<string, WorkspaceChange> = {
  trip_itinerary_items: "itinerary",
  trip_places: "places",
  trip_preferences: "preferences",
  trip_decisions: "decision",
  conversation_messages: "conversation",
};

export type PresencePeer = { userId: string; name: string; viewingPath: string };

/**
 * Subscribe to a trip's row changes over Supabase Realtime and re-broadcast them
 * on the same in-tab bus every mutation already uses, so `TripDataProvider`'s
 * `router.refresh()` fires for a collaborator's edit too. Also tracks presence.
 * Debounced so a burst of collaborator writes causes one refresh.
 */
export function useTripRealtime(tripId: string, me?: { userId: string; name: string }): PresencePeer[] {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Set<WorkspaceChange>>(new Set());

  useEffect(() => {
    if (!tripId || tripId === "rebuild-preview") return;
    const env = getPublicEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`trip:${tripId}`, { config: { presence: { key: me?.userId ?? "anon" } } });

    const flush = () => {
      timer.current = null;
      for (const change of pending.current) announceWorkspaceChange(change);
      pending.current.clear();
    };
    const schedule = (change: WorkspaceChange) => {
      pending.current.add(change);
      if (!timer.current) timer.current = setTimeout(flush, 250);
    };

    for (const table of Object.keys(TABLE_TO_CHANGE)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` }, () => schedule(TABLE_TO_CHANGE[table]));
    }

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ userId: string; name: string; viewingPath: string }>();
      const seen = new Map<string, PresencePeer>();
      for (const entries of Object.values(state)) for (const e of entries) seen.set(e.userId, { userId: e.userId, name: e.name, viewingPath: e.viewingPath });
      setPeers([...seen.values()]);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && me) {
        void channel.track({ userId: me.userId, name: me.name, viewingPath: typeof window !== "undefined" ? window.location.pathname : "" });
      }
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe only on the identity primitives, not the prop object
  }, [tripId, me?.userId, me?.name]);

  return peers;
}
