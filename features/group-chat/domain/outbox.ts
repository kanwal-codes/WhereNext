/** A message that has not reached the server yet (sending) or could not (failed). It lives outside the real history. */
export type Outgoing = {
  key: string;
  content: string;
  status: "sending" | "failed";
  created_at: string;
  /** Why it failed, in words for the sender. */
  reason?: string;
  /** Worth trying again by itself (no connection, a slow or broken server), as opposed to one the server refused. */
  retryable?: boolean;
};

/** How long a send may take before it is called failed. Safe to cut short: the retry reuses the idempotency key. */
export const SEND_TIMEOUT_MS = 20_000;

/** Error carrying the HTTP status, so a failure can be explained instead of just "not sent". */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`request failed: ${status}`);
  }
}

/** What happened to a send, for the person who sent it, and whether trying again by itself could help. */
export function sendFailure(error: unknown): { reason: string; retryable: boolean } {
  const status = error instanceof HttpError ? error.status : null;
  if (status === 401) return { reason: "You were signed out. Sign in again, then retry.", retryable: false };
  if (status === 403 || status === 404) return { reason: "You are no longer part of this trip.", retryable: false };
  if (status === 400 || status === 413) return { reason: "That message could not be sent as written.", retryable: false };
  if (status === 429) return { reason: "Too many messages at once. Wait a moment, then retry.", retryable: true };
  if (status !== null && status >= 500) return { reason: "The server had a problem. Try again in a moment.", retryable: true };
  if (error instanceof DOMException && error.name === "AbortError") return { reason: "It took too long.", retryable: true };
  return { reason: "No connection.", retryable: true };
}

/** Unsent messages worth keeping across a reload (a sending one is as good as failed once the page is gone). */
export function serializeOutbox(outbox: Outgoing[]): string {
  return JSON.stringify(outbox.map(({ key, content, created_at, reason, retryable }) => ({ key, content, created_at, reason, retryable })));
}

/** Read back what `serializeOutbox` wrote; anything malformed is dropped rather than trusted. Everything returns as failed. */
export function restoreOutbox(raw: string | null): Outgoing[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): Outgoing[] => {
      const o = item as Partial<Outgoing> | null;
      if (!o || typeof o.key !== "string" || typeof o.content !== "string" || typeof o.created_at !== "string" || !o.content.trim()) return [];
      return [{ key: o.key, content: o.content, created_at: o.created_at, status: "failed", reason: o.reason ?? "Not sent before you left.", retryable: o.retryable ?? true }];
    });
  } catch {
    return [];
  }
}

/** How far this device's clock is from the server's, in ms (positive: the server is ahead). Only whole seconds are known from a Date header. */
export function clockSkewMs(serverDate: string | null | undefined, localNow: number): number {
  const server = serverDate ? Date.parse(serverDate) : NaN;
  return Number.isFinite(server) ? server - localNow : 0;
}
