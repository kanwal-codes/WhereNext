import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { notifyToast } from "@/lib/application/toast";
import { applyReactionToggle, applyVote } from "../domain/chat-state";
import type { GroupMessage } from "../domain/message";
import { postJson } from "./postJson";


/**
 * What a member does to a message in the thread: react (the hover button, or the smiley under it on a phone), vote on a poll, start a poll.
 * Each is optimistic against the local list and put right by `refresh` if the server disagrees.
 */
export function useGroupInteractions({ tripId, setMessages, refresh }: { tripId: string; setMessages: Dispatch<SetStateAction<GroupMessage[]>>; refresh: () => Promise<unknown> | void }) {
  const [expandedReactionFor, setExpandedReactionFor] = useState<string | null>(null);
  const [pendingVoteFor, setPendingVoteFor] = useState<string | null>(null);
  // Guards against the server-side toggle race: a delete-then-insert isn't atomic, so two
  // near-simultaneous taps on the same (message, emoji) can both see "not reacted yet" and
  // both insert, or the second can re-add what the first just removed. Blocking a second
  // request for the same key while one is in flight covers the common trigger (a fast
  // double-tap); it doesn't cover two separate tabs racing, which would need a DB-side atomic
  // upsert-toggle (ponytail: revisit with a stored procedure if that's ever actually seen).
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  // Tap anywhere outside an expanded inline emoji bar to close it.
  useEffect(() => {
    if (!expandedReactionFor) return;
    function onDocPointerDown(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest("[data-reaction-expand]")) setExpandedReactionFor(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [expandedReactionFor]);

  async function createPoll(question: string, options: string[]): Promise<boolean> {
    try {
      const { message } = await postJson<{ message: GroupMessage }>(`/api/trips/${tripId}/polls`, { question, options });
      setMessages((current) => [...current, message]);
      return true;
    } catch {
      notifyToast("Couldn’t start that poll.", "error");
      return false;
    }
  }

  // Optimistic: flips this member's own selection immediately in the local list (the poll's
  // realtime "groupChat" change confirms it — and corrects it — for every viewer shortly after).
  async function castVote(messageId: string, pollId: string, optionKey: string) {
    if (pendingVoteFor === pollId) return;
    setPendingVoteFor(pollId);
    setMessages((current) => applyVote(current, messageId, optionKey));
    try {
      await postJson(`/api/trips/${tripId}/polls/${pollId}/vote`, { optionKey });
    } catch {
      // Back to what the server says, not to an old snapshot of the whole chat (which would drop anything that arrived since).
      void refresh();
      notifyToast("Your vote didn’t save.", "error");
    } finally {
      setPendingVoteFor(null);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const key = `${messageId}:${emoji}`;
    if (pendingReactionsRef.current.has(key)) return;
    pendingReactionsRef.current.add(key);
    setExpandedReactionFor(null);
    // Optimistic flip so the tap feels instant; refresh() reconciles shortly after via the
    // realtime-driven workspace-change bus.
    setMessages((current) => applyReactionToggle(current, messageId, emoji));
    try {
      await postJson(`/api/trips/${tripId}/group-chat/${messageId}/reactions`, { emoji });
    } catch {
      void refresh();
    } finally {
      pendingReactionsRef.current.delete(key);
    }
  }

  return { expandedReactionFor, setExpandedReactionFor, pendingVoteFor, createPoll, castVote, toggleReaction };
}
