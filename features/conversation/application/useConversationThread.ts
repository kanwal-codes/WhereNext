import { useEffect, useRef, useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import type { Message } from "../domain/message";
import { mergeConversationMessages } from "../domain/mergeMessages";
import { CONVERSATION_CACHE_TTL_MS, readConversationCache, writeConversationCache } from "./conversationCache";

/**
 * The trip's own Roam thread: from the session cache if it is warm, from /api/trips/[tripId]/conversation otherwise. It used
 * to also arrive as a prop on every trip page's server render, which only duplicated the request made here a moment later.
 */
export function useConversationThread(tripId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The thread's own load from the server has finished (or was not needed). The landing page's first message waits for it:
  // sent earlier, the load's rows are merged in while Roam's reply is streaming.
  const [synced, setSynced] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  // When this state was last confirmed against the server — distinct from "now", so a local
  // edit (optimistic send, settled stream) doesn't silently re-arm the cache's freshness TTL.
  const verifiedAtRef = useRef(0);
  // Message ids treated as already-settled — restored history (the cache, a background merge)
  // must appear in place, not replay its whole entrance animation every time the log mounts.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Restore the last visible conversation immediately, then reconcile with the server in the
  // background. This keeps tab changes instant without turning the client cache into truth.
  useEffect(() => {
    const cached = readConversationCache(tripId);
    if (cached) {
      setMessages(cached.messages);
      setLoaded(true);
      // Preserve the cache's real verification time — restoring it must not look like a fresh check.
      verifiedAtRef.current = cached.savedAt;
      for (const m of cached.messages) seenMessageIdsRef.current.add(m.id);
    }
    setCacheReady(true);
    // A quick tab round-trip should not hit the conversation API again. A new device has no
    // session cache, so it still loads the durable server thread immediately.
    if (cached && Date.now() - cached.savedAt < CONVERSATION_CACHE_TTL_MS) {
      setSynced(true);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/trips/${tripId}/conversation`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return response.json();
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          verifiedAtRef.current = Date.now();
          const fresh = (body.messages ?? []) as Message[];
          for (const m of fresh) seenMessageIdsRef.current.add(m.id);
          setMessages((current) => mergeConversationMessages(current, fresh));
          setLoaded(true);
          setSynced(true);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cached) notifyToast("Couldn’t load the conversation — reload to try again.", "error");
        setLoaded(true);
        setSynced(true);
      });
    return () => controller.abort();
  }, [tripId]);

  useEffect(() => {
    if (cacheReady) writeConversationCache(tripId, messages, verifiedAtRef.current);
  }, [cacheReady, messages, tripId]);

  // A slow load must not hold the visitor's first message forever: after a few seconds it goes anyway (the merge keeps the order).
  useEffect(() => {
    const timer = setTimeout(() => setSynced(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  return { messages, setMessages, loaded, synced, seenMessageIdsRef };
}
