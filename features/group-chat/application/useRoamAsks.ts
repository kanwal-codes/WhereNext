import { useEffect, useRef, useState } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import type { AssistantTurnMeta } from "@/packages/contracts/assistant";
import { unansweredRoamAsks, type GroupMessage } from "../domain/message";
import { postJson } from "./postJson";

/**
 * The group chat's @Roam asks: which are in flight, which got no answer, which anyone is still waiting on,
 * and the request that asks Roam to reply. `onContinueThread` fires when a fresh reply answers something you said.
 */
export function useRoamAsks({ tripId, messages, loaded, skewRef, meUserId, refresh, onContinueThread }: {
  tripId: string;
  messages: GroupMessage[];
  loaded: boolean;
  skewRef: { current: number };
  meUserId: string | undefined;
  refresh: () => Promise<GroupMessage[] | undefined>;
  onContinueThread: () => void;
}) {
  // Roam asks (anyone's) that are still waiting for a reply.
  const [waitingIds, setWaitingIds] = useState<string[]>([]);
  // @Roam asks that got no reply: the call failed just now, or two minutes passed with nothing (also after a reload, and for other members' asks).
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [failedRoamIds, setFailedRoamIds] = useState<string[]>([]);
  // Which @Roam asks are currently in flight — the buffered (non-streamed) reply can take a
  // while, and until now nothing at all told the user a reply was coming. Keyed by messageId so
  // several concurrent asks (different members, or a retry) each get their own indicator.
  const [pendingRoamIds, setPendingRoamIds] = useState<Set<string>>(new Set());
  // Which Roam replies have already been considered for the auto-continue prefill below —
  // seeded with every id already in history on first load, so opening the chat doesn't refill
  // the composer for something Roam answered days ago.
  const seenReplyIdsRef = useRef<Set<string>>(new Set());
  const seenReplyBaselineRef = useRef(false);

  // Anyone's @Roam ask with no answer yet shows the typing bubble to the whole group, not just to whoever asked.
  useEffect(() => {
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
    const compute = () => {
      const { waiting, missed } = unansweredRoamAsks(messages, Date.now() + skewRef.current);
      setWaitingIds((current) => (same(current, waiting) ? current : waiting));
      setMissedIds((current) => (same(current, missed) ? current : missed));
      return waiting.length;
    };
    if (compute() === 0) return;
    const timer = setInterval(compute, 5000);
    return () => clearInterval(timer);
  }, [messages, skewRef]);

  // Keeps a continuing exchange with Roam going without re-typing the mention every turn: once
  // a fresh reply lands answering something *you* said, pre-fill "@Roam " so your next message
  // picks the thread back up — only when the composer is empty, so it never clobbers a draft.
  useEffect(() => {
    if (!loaded) return;
    if (!seenReplyBaselineRef.current) {
      for (const m of messages) seenReplyIdsRef.current.add(m.id);
      seenReplyBaselineRef.current = true;
      return;
    }
    for (const m of messages) {
      if (m.role !== "assistant" || seenReplyIdsRef.current.has(m.id)) continue;
      seenReplyIdsRef.current.add(m.id);
      // Roam changed the trip (dates, destination, travellers): "What we know" beside the chat re-reads it now, not after a reload.
      if ((m.metadata as Partial<AssistantTurnMeta> | undefined)?.blocks?.some((block) => block.type === "trip_update")) announceWorkspaceChange("preferences");
      const replyToId = (m.metadata as { replyToMessageId?: string } | undefined)?.replyToMessageId;
      const source = replyToId ? messages.find((s) => s.id === replyToId) : undefined;
      if (source?.userId && source.userId === meUserId) onContinueThread();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to new messages, not to the callback's identity
  }, [messages, loaded, meUserId]);

  // Fire-and-forget from the caller's perspective — a failed reply shouldn't block the rest of
  // the chat — but never silent: the idempotency key on the server means retrying is always safe
  // (it upserts onto the same reply row rather than composing a second one).
  // `explicit` is the "Ask Roam about this" message action (long-press / inline-expand, same
  // surface as reactions) — it works on any member's message, not just one that says "@Roam".
  function askRoam(messageId: string, options: { explicit?: boolean } = {}) {
    setPendingRoamIds((current) => new Set(current).add(messageId));
    setFailedRoamIds((current) => current.filter((id) => id !== messageId));
    // The generous ceiling (well above the server's own worst-case RESOLVE+RETRIEVE+COMPOSE
    // budget — see AI_DEADLINE_MS in packages/ai/model-policy.ts, whose slowest chain tops out
    // well under this) is deliberate: aborting from here cancels the request the server is still
    // working on (it's wired to the same signal), so firing early would cause exactly the missed
    // reply this whole handler exists to recover from. This is a backstop for a truly dead
    // connection, not a normal-operation timeout — the "thinking" indicator should never hang
    // forever with nothing to show for it.
    void postJson(`/api/trips/${tripId}/group-chat/roam`, { messageId, ...options }, 150_000)
      .then(() => {
        void refresh();
        // The planner may also have stored trip facts or suggestions during this turn.
        announceWorkspaceChange("preferences");
      })
      .catch(async () => {
        // A failure here doesn't necessarily mean the turn itself failed — this reply is a
        // buffered, potentially slow round trip, and a dropped connection or a proxy timeout can
        // lose the RESPONSE after the server has already finished and persisted it. Check before
        // reporting an error: live-caught without this, the toast said "didn't reply" (or nothing
        // at all, if it was missed while the tab was backgrounded) right as the real reply sat
        // fully written in the database — only surfacing once some unrelated later refresh swept
        // it in, alongside whatever was asked at that point.
        const fresh = await refresh();
        const alreadyAnswered = fresh?.some((m) => (m.metadata as { replyToMessageId?: string } | null)?.replyToMessageId === messageId);
        // Shown right under the message (with its Retry), not as a toast that disappears.
        if (!alreadyAnswered) setFailedRoamIds((current) => (current.includes(messageId) ? current : [...current, messageId]));
      })
      .finally(() => setPendingRoamIds((current) => {
        if (!current.has(messageId)) return current;
        const next = new Set(current);
        next.delete(messageId);
        return next;
      }));
  }

  return { askRoam, pendingRoamIds, failedRoamIds, waitingIds, missedIds };
}
