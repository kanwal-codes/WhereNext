"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { announceWorkspaceChanges, type WorkspaceChange } from "@/lib/application/workspace-events";
import { getPublicEnv } from "@/lib/env";

/** Which workspace slice a change to each published table maps to — every table a mutation
 *  route writes needs an entry here, or a collaborator's edit to it never reaches other
 *  devices watching the same trip until they manually reload. Exported so a test can catch
 *  the next table that's added without this list being updated to match. */
export const TABLE_TO_CHANGE: Record<string, WorkspaceChange> = {
  trips: "preferences",
  trip_itinerary_items: "itinerary",
  trip_places: "places",
  trip_preferences: "preferences",
  trip_decisions: "decision",
  // A flight/stay booking made by one member (or on another device) otherwise never reaches
  // anyone else watching the trip — reuses "decision" (rather than a new WorkspaceChange
  // variant) since that's already what a successful booking announces same-tab, in useBookingFlow.
  bookings: "decision",
  trip_essentials: "essentials",
  // A reservation added by another member reaches the Bookings page the same way a booking does.
  trip_reservations: "decision",
  conversation_messages: "conversation",
  group_messages: "groupChat",
  group_message_reactions: "groupChat",
  // A poll IS a group message (its own kind, with a live tally embedded from trip_poll_votes) —
  // reuses "groupChat" rather than a new WorkspaceChange variant, since a vote should trigger
  // exactly the same message-list refetch a new message already does.
  trip_polls: "groupChat",
  trip_poll_votes: "groupChat",
  trip_date_availability: "availability",
  trip_expenses: "expenses",
  // A friend joining via the invite link, a role change, or someone leaving otherwise never
  // reaches another member's already-open group chat / member list / @mention target list.
  trip_members: "members",
};

export function realtimeFilterForTable(table: string, tripId: string): string {
  return table === "trips" ? `id=eq.${tripId}` : `trip_id=eq.${tripId}`;
}

export type PresencePeer = { userId: string; name: string; viewingPath: string };

/** Exponential backoff, capped at 30s, for reconnect attempt N (0-indexed) — 1s, 2s, 4s, 8s,
 *  16s, 30s, 30s, ... A laptop waking from sleep or a WiFi handoff drops the socket with no
 *  warning; retrying forever at a bounded interval is the standard pattern (matches what the
 *  underlying Phoenix socket already does for the raw connection) rather than giving up after a
 *  fixed number of tries — an offline hour shouldn't mean the trip is un-collaborative forever
 *  after the wait, only for however long it actually stays offline. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

/**
 * Subscribe to a trip's row changes over Supabase Realtime and re-broadcast them
 * on the same in-tab bus every mutation already uses, so `TripDataProvider`'s
 * `router.refresh()` fires for a collaborator's edit too. Also tracks presence.
 * Debounced so a burst of collaborator writes causes one refresh.
 *
 * Reconnects with backoff on drop (a flaky network, a laptop waking from sleep) — until this
 * was added, a channel error was logged once and the tab silently stopped receiving (and
 * broadcasting presence for) every collaborator update for the rest of the session, with
 * nothing but a console.error to show for it and no recovery short of a manual reload.
 */
export function useTripRealtime(tripId: string, me?: { userId: string; name: string }): PresencePeer[] {
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Set<WorkspaceChange>>(new Set());
  const pathname = usePathname();
  // Live handle to the current channel + whether it's actually subscribed yet — lets the
  // separate name/path effect below re-announce presence without tearing the channel down.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!tripId || tripId === "rebuild-preview") return;
    const env = getPublicEnv();
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let channel: RealtimeChannel | null = null;

    const connect = () => {
      if (cancelled) return;
      // A local, stable reference to THIS connect() call's own channel — the subscribe callback
      // below checks identity against the shared `channel` variable before acting, so a stray
      // event from a channel this function has already superseded (a duplicate CHANNEL_ERROR
      // immediately followed by CLOSED for the same dead channel, both racing in before the
      // first one's `removeChannel` finishes) is ignored instead of scheduling a second parallel
      // reconnect — which used to create a second channel for the same topic while Supabase's
      // client still had the first one's teardown in flight, and crash calling `.on()` on it
      // ("cannot add postgres_changes callbacks... after subscribe()"). Confirmed live: this
      // exact crash reproduced immediately without the identity guard.
      const ch = supabase.channel(`trip:${tripId}`, { config: { presence: { key: me?.userId ?? "anon" } } });
      channel = ch;
      channelRef.current = ch;
      subscribedRef.current = false;

      for (const table of Object.keys(TABLE_TO_CHANGE)) {
        ch.on("postgres_changes", { event: "*", schema: "public", table, filter: realtimeFilterForTable(table, tripId) }, () => schedule(TABLE_TO_CHANGE[table]));
      }

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{ userId: string; name: string; viewingPath: string }>();
        const seen = new Map<string, PresencePeer>();
        for (const entries of Object.values(state)) for (const e of entries) seen.set(e.userId, { userId: e.userId, name: e.name, viewingPath: e.viewingPath });
        setPeers([...seen.values()]);
      });

      ch.subscribe((status, error) => {
        if (cancelled || channel !== ch) return;
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
          attempt = 0;
          if (me) void ch.track({ userId: me.userId, name: me.name, viewingPath: pathname ?? "" });
          return;
        }
        // Logged either way — picked up by Sentry like any other console error — but now also
        // retried with backoff instead of leaving this tab permanently deaf to collaborator
        // edits for the rest of the session.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribedRef.current = false;
          console.error(`[trip-realtime] channel ${status.toLowerCase()} for trip ${tripId}`, error);
          channel = null;
          void supabase.removeChannel(ch);
          if (cancelled) return;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          const delay = reconnectDelayMs(attempt);
          attempt += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      });
    };

    const flush = () => {
      timer.current = null;
      announceWorkspaceChanges([...pending.current]);
      pending.current.clear();
    };
    const schedule = (change: WorkspaceChange) => {
      pending.current.add(change);
      if (!timer.current) timer.current = setTimeout(flush, 250);
    };

    connect();

    // The socket can die silently while a tab is backgrounded — mobile OSes (and some desktop
    // browsers) suspend an inactive tab's WebSocket with no CHANNEL_ERROR/CLOSED event ever
    // firing, so the reconnect-with-backoff logic above never triggers. Live-caught: a member
    // returning to a group chat tab that sat backgrounded saw no new messages until a manual
    // reload, even though someone else had sent one minutes earlier. Coming back to a visible
    // tab both forces an immediate reconnect if the channel died, and — regardless of whether it
    // did — re-announces every change type once, so any mounted component (group chat, the
    // itinerary, etc.) refetches instead of trusting a channel that may have missed events while
    // backgrounded.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!subscribedRef.current) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        attempt = 0;
        connect();
      }
      announceWorkspaceChanges([...new Set(Object.values(TABLE_TO_CHANGE))]);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      channelRef.current = null;
      subscribedRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe only on the identity primitive; name/path re-announce below without resubscribing
  }, [tripId, me?.userId]);

  // A display-name edit or a client-side navigation shouldn't tear down and resubscribe all ten
  // table listeners just to update two presence fields — re-track on the same channel instead.
  useEffect(() => {
    if (!me || !channelRef.current || !subscribedRef.current) return;
    void channelRef.current.track({ userId: me.userId, name: me.name, viewingPath: pathname ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-track on the identity primitives, not the prop object
  }, [me?.userId, me?.name, pathname]);

  return peers;
}
