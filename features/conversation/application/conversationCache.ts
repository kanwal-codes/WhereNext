import type { Message } from "../domain/message";

const conversationCacheKey = (tripId: string) => `where-next:conversation:${tripId}`;

type ConversationCache = { savedAt: number; messages: Message[] };

export const CONVERSATION_CACHE_TTL_MS = 60_000;

export function readConversationCache(tripId: string): ConversationCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(conversationCacheKey(tripId)) ?? "null") as Partial<ConversationCache> | null;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter((message): message is Message => Boolean(message && typeof message === "object" && (message as Message).role && typeof (message as Message).content === "string"));
    return messages.length > 0 ? { savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0, messages } : null;
  } catch {
    return null;
  }
}

/** `verifiedAt` is when this content was last confirmed against the server — NOT "now". Passing
 *  the real verification time (rather than always stamping the write) is what makes the 60s TTL
 *  below mean anything: otherwise every local edit (an optimistic send, a settled stream) would
 *  re-arm the freshness window and a revisit could skip server reconciliation indefinitely. */
export function writeConversationCache(tripId: string, messages: Message[], verifiedAt: number) {
  if (typeof window === "undefined" || messages.length === 0) return;
  try {
    window.sessionStorage.setItem(conversationCacheKey(tripId), JSON.stringify({ savedAt: verifiedAt, messages } satisfies ConversationCache));
  } catch {
    // Session storage can be unavailable or full; the server remains the source of truth.
  }
}
