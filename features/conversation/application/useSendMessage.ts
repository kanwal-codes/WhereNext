import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import { haptic } from "@/lib/haptics";
import type { ProposedCommand } from "@/packages/contracts/assistant";
import type { Message } from "../domain/message";
import { sendFailureToast } from "../domain/sendOutcome";
import { AssistantRequestError } from "./streamAssistantResponse";
import { sendConversationMessage } from "./sendConversationMessage";

/**
 * Sending in the Roam chat: the optimistic message, the streamed reply, retry under one idempotency key, a message queued
 * behind a reply still finishing, Stop, the guest's free-message gate, and the landing page's first sentence.
 */
export function useSendMessage({ tripId, viewContext, messages, setMessages, loaded, synced, guest, onSurfaceSelect, setProposal, setInput, stopListening, seenMessageIdsRef }: {
  tripId: string;
  viewContext?: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  loaded: boolean;
  synced: boolean;
  guest: boolean;
  onSurfaceSelect?: (surface: string) => void;
  setProposal: (proposal: ProposedCommand | null) => void;
  setInput: Dispatch<SetStateAction<string>>;
  stopListening: () => void;
  seenMessageIdsRef: MutableRefObject<Set<string>>;
}) {
  const [sending, setSending] = useState(false);
  // The id of the message the server has not confirmed yet: "Sending…" belongs to it alone, and ends the moment the server has it, not when the whole reply is done.
  const [undelivered, setUndelivered] = useState<string | null>(null);
  // Set synchronously: two quick taps on a chip (or Enter twice) can both arrive before `sending` has re-rendered, and each used to send its own copy of the message.
  const sendingRef = useRef(false);
  // The sentence the landing page handed over, shown the moment the chat opens (before the thread has loaded and before
  // it is sent) so the visitor never sees an empty chat between the landing page and their own message.
  const [pendingFirst, setPendingFirst] = useState<{ text: string; key: string } | null>(null);
  // A guest who has used their free messages (the server said so) — the composer closes and the save card opens.
  const [guestGate, setGuestGate] = useState(false);
  // Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): the real backend milestone for the
  // in-flight turn, driving Typing's label — replaces a purely time-based guess.
  // A failed turn, shown with Roam's mark for a moment. (A successful one just ends with its text.)
  const [outcome, setOutcome] = useState<{ kind: "error"; at: number } | null>(null);
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 4000);
    return () => clearTimeout(timer);
  }, [outcome]);
  const [progressStage, setProgressStage] = useState<"resolve" | "retrieve" | "compose" | undefined>(undefined);
  // What RESOLVE actually planned to look up ("checking places", "getting directions"), shown
  // during "retrieve" instead of Typing's generic label — undefined falls back to that generic
  // text (no tools planned, or none the label map recognizes).
  const [progressLabel, setProgressLabel] = useState<string | undefined>(undefined);
  const requestRef = useRef<AbortController | null>(null);
  const [queued, setQueued] = useState<string | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  // A message typed while a reply was finishing goes out as soon as the reply is done.
  useEffect(() => {
    if (sending || queued === null) return;
    const next = queued;
    setQueued(null);
    void submit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, queued]);

  async function submit(rawContent: string, retryKey?: string) {
    const content = rawContent.trim();
    if (!content || !loaded || guestGate) return;
    // Enter while a reply is still finishing used to do nothing and leave the text in the box. Keep it, say so, and send it after.
    if (sending || sendingRef.current) {
      setQueued(content);
      setInput("");
      return;
    }
    stopListening();
    haptic("tap");
    sendingRef.current = true;
    setSending(true);
    setOutcome(null);
    setInput("");
    const previous = messages;
    // Stable across every retry of THIS send (never a fresh crypto.randomUUID() per attempt) —
    // the server upserts on (thread, idempotency_key), so reusing it lets a retry collapse into
    // the original row instead of silently duplicating a message that actually saved fine the
    // first time but whose response the client never saw (a dropped connection, a timeout).
    const messageIdempotencyKey = retryKey ?? crypto.randomUUID();
    const userMessage: Message = { id: `local-${messageIdempotencyKey}`, role: "user", content, created_at: new Date().toISOString() };
    // Same id across retries too — don't stack a second bubble for a message already showing.
    const next = previous.some((m) => m.id === userMessage.id) ? previous : [...previous, userMessage];
    setMessages(next);
    setUndelivered(userMessage.id);
    let userSaved = false;
    try {
      const controller = new AbortController();
      requestRef.current = controller;
      let assistantId = "";
      setProgressStage(undefined);
      setProgressLabel(undefined);
      const result = await sendConversationMessage({
        tripId,
        content,
        viewContext,
        idempotencyKey: messageIdempotencyKey,
        onSurfaceSelect,
        // A guest can't save changes, so Roam's "save this preference?" proposals are not offered.
        onProposal: (next) => { if (!guest) setProposal(next); },
        onUserSaved: () => {
          userSaved = true;
          setUndelivered(null);
        },
        onAssistantStart: (responseId) => {
          assistantId = responseId;
          setMessages((current) => [
            ...current,
            { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
          ]);
        },
        onAssistantDelta: (assistant) => {
          setMessages((current) => current.map((m) => (m.id === assistantId ? { ...m, content: assistant } : m)));
          // No auto-scroll here (deliberately — see `scrollToLatestMessage`'s comment). The
          // reveal already happened once, when this message was added; the user reads down into
          // it at their own pace rather than being dragged along as it keeps growing.
        },
        onProgress: (stage, label) => {
          setProgressStage(stage);
          setProgressLabel(label);
        },
        signal: controller.signal,
      });
      // Settle the streamed bubble in place: sanitized text + the structured blocks from the
      // meta frame. No refetch, so ids stay stable and nothing re-mounts.
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId
            ? { ...m, content: result.content || m.content, metadata: result.meta ? (result.meta as unknown as Record<string, unknown>) : m.metadata }
            : m,
        ),
      );
      // The resolver may have persisted core trip facts or pending suggestions during this turn.
      // Refresh server-rendered workspace surfaces so “What we know” reflects the same response.
      announceWorkspaceChange("preferences");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof AssistantRequestError && (err.code === "guest_limit" || err.code === "guest_busy")) {
        // Not saved, so nothing to retry: hand the text back and ask them to save the trip.
        setMessages(previous);
        setInput(content);
        setGuestGate(true);
        return;
      }
      if (userSaved) setOutcome({ kind: "error", at: Date.now() });
      setMessages(userSaved ? next : previous);
      // Not saved: the text would otherwise exist only inside the toast's Retry. Put it back in the box (unless they have already started something new).
      if (!userSaved) setInput((current) => current || content);
      const message = sendFailureToast({ userSaved, aiError: err instanceof AssistantRequestError, status: err instanceof AssistantRequestError ? err.status : undefined });
      notifyToast(message, "error", { label: "Retry", onClick: () => void submit(content, messageIdempotencyKey) });
    } finally {
      requestRef.current = null;
      sendingRef.current = false;
      setSending(false);
      setUndelivered(null);
    }
  }

  function stop() {
    requestRef.current?.abort();
    sendingRef.current = false;
    setSending(false);
    setMessages((current) => current.filter((m) => !(m.role === "assistant" && !m.content.trim())));
  }

  useLayoutEffect(() => {
    let text: string | null = null;
    try {
      text = window.sessionStorage.getItem(`wn:first-message:${tripId}`);
    } catch {
      /* storage blocked: no hand-off */
    }
    if (!text?.trim()) return;
    const key = crypto.randomUUID();
    // Its bubble is already on screen, so the real one that replaces it does not rise in again.
    seenMessageIdsRef.current.add(`local-${key}`);
    setPendingFirst({ text: text.trim(), key });
  }, [tripId, seenMessageIdsRef]);

  // The landing page's prompt box creates the trip and drops its sentence here: it becomes the
  // first message, sent once the (empty) thread has loaded — the visitor lands mid-conversation.
  // Deferred a tick so React's dev-only mount/unmount/mount pass can't consume the sentence and
  // then abort the send (the unmount cleanup above aborts any in-flight request).
  useEffect(() => {
    // A fresh thread already holds Roam's greeting, so "empty" means no message from the visitor yet.
    // The thread has to be loaded first (see `synced`), or the sentence is sent against a thread whose
    // own rows arrive after it — the 4 s timer above keeps a slow load from holding it forever.
    if (!loaded || !synced || sending || messages.some((m) => m.role === "user")) return;
    const timer = setTimeout(() => {
      const key = `wn:first-message:${tripId}`;
      const first = window.sessionStorage.getItem(key);
      if (!first) return;
      window.sessionStorage.removeItem(key);
      void submit(first, pendingFirst?.text === first.trim() ? pendingFirst.key : undefined);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the thread has loaded empty
  }, [loaded, synced, pendingFirst]);

  return { sending, undelivered, outcome, progressStage, progressLabel, queued, setQueued, guestGate, pendingFirst, submit, stop };
}
