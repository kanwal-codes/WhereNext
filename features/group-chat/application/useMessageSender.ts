import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { haptic } from "@/lib/haptics";
import { hasAsk, mentionsRoam, type GroupMessage } from "../domain/message";
import { SEND_TIMEOUT_MS, restoreOutbox, sendFailure, serializeOutbox, type Outgoing } from "../domain/outbox";
import { postJson } from "./postJson";

/**
 * Sending in the group chat. A message shows at once as "Sending…" and keeps its idempotency key through any Retry,
 * so a reply lost on the way back never posts the same words twice. Unsent messages and the half-typed one survive a
 * reload (kept per trip, per tab), and are sent again when the connection returns.
 */
export function useMessageSender({ tripId, meUserId, input, setInput, messages, setMessages, seenIdsRef, refresh, askRoam, stopListening }: {
  tripId: string;
  meUserId: string | undefined;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  messages: GroupMessage[];
  setMessages: Dispatch<SetStateAction<GroupMessage[]>>;
  seenIdsRef: MutableRefObject<Set<string>>;
  refresh: () => Promise<GroupMessage[] | undefined>;
  askRoam: (messageId: string, options?: { explicit?: boolean }) => void;
  stopListening: () => void;
}) {
  // Messages you have sent that the server has not confirmed: they show at once, as "Sending…", and stay with a Retry if they fail.
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  // The unsent messages (and the half-typed one) survive a reload or a trip to another page: kept per trip, per tab.
  const outboxKey = `wn-outbox:${tripId}:${meUserId ?? "anon"}`;
  const draftKey = `wn-draft:${tripId}:${meUserId ?? "anon"}`;
  const [restored, setRestored] = useState(false);
  const outboxRef = useRef<Outgoing[]>([]);
  outboxRef.current = outbox;
  // Keys with a request in flight right now, so a retry (by hand or by the connection coming back) never doubles up.
  const inflightRef = useRef<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  // A double Enter can arrive before the state has re-rendered and would post the message twice.
  const submitLockRef = useRef(false);

  // Optimistic: the message appears at once as "Sending…", and keeps its idempotency key through a Retry, so a reply
  // lost on the way back never posts the same words twice.
  async function submit(raw: string, retryKey?: string) {
    const content = raw.trim();
    // The double-Enter lock is for a fresh send; a retry is guarded by its own in-flight key instead (several can go out at once).
    if (!content || !hasAsk(content) || (!retryKey && submitLockRef.current)) return;
    if (retryKey && inflightRef.current.has(retryKey)) return;
    stopListening();
    haptic("tap");
    if (!retryKey) {
      submitLockRef.current = true;
      requestAnimationFrame(() => { submitLockRef.current = false; });
    }
    const key = retryKey ?? crypto.randomUUID();
    inflightRef.current.add(key);
    if (!retryKey) setInput("");
    setOutbox((current) => (retryKey ? current.map((o) => (o.key === key ? { ...o, status: "sending", reason: undefined } : o)) : [...current, { key, content, status: "sending", created_at: new Date().toISOString() }]));
    try {
      const { message } = await postJson<{ message: GroupMessage }>(`/api/trips/${tripId}/group-chat`, { content, kind: "text", idempotencyKey: key }, SEND_TIMEOUT_MS);
      seenIdsRef.current.add(message.id);
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
      setOutbox((current) => current.filter((o) => o.key !== key));
      if (mentionsRoam(content)) askRoam(message.id);
    } catch (error) {
      const failure = sendFailure(error);
      setOutbox((current) => current.map((o) => (o.key === key ? { ...o, status: "failed", ...failure } : o)));
    } finally {
      inflightRef.current.delete(key);
    }
  }

  // Back online: read the thread again, and send what was waiting (same keys, so nothing posts twice).
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void refresh();
      for (const o of outboxRef.current) if (o.status === "failed" && o.retryable) void submit(o.content, o.key);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit/refresh are read fresh through the closure each time the effect re-runs on trip change
  }, [tripId]);

  // On open: bring back what was unsent (and the half-typed message), and send the unsent once more if we are online.
  useEffect(() => {
    let saved: Outgoing[] = [];
    try {
      saved = restoreOutbox(sessionStorage.getItem(outboxKey));
      const draft = sessionStorage.getItem(draftKey);
      if (draft) setInput((current) => current || draft);
    } catch { /* storage blocked: nothing to bring back */ }
    if (saved.length > 0) setOutbox((current) => [...saved.filter((r) => !current.some((c) => c.key === r.key)), ...current]);
    setRestored(true);
    if (navigator.onLine) for (const o of saved) if (o.retryable) void submit(o.content, o.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per trip
  }, [tripId]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (outbox.length > 0) sessionStorage.setItem(outboxKey, serializeOutbox(outbox));
      else sessionStorage.removeItem(outboxKey);
    } catch { /* storage full or blocked */ }
  }, [outbox, restored, outboxKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (input) sessionStorage.setItem(draftKey, input);
      else sessionStorage.removeItem(draftKey);
    } catch { /* storage full or blocked */ }
  }, [input, restored, draftKey]);

  // A message that really arrived (it came back from the server under the key it was sent with) is no longer "unsent":
  // this clears the unsent copy that would otherwise sit beside it when the reply to the send was lost, or when the
  // live update beat the reply.
  useEffect(() => {
    const delivered = new Set(messages.map((m) => m.clientKey).filter(Boolean));
    if (delivered.size === 0) return;
    setOutbox((current) => (current.some((o) => delivered.has(o.key)) ? current.filter((o) => !delivered.has(o.key)) : current));
  }, [messages]);

  return { outbox, setOutbox, submit, online };
}
