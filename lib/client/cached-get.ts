/**
 * `fetch` for slow, read-only lookups (place search, events, hotel prices — 4 to 9 seconds each, all from
 * third parties). A fresh answer from the last few minutes is returned instantly, from sessionStorage, so
 * leaving Discover and coming back (or opening the same Stay search twice) no longer waits again. The server
 * keeps its own cache; this one just saves the round trip. `ttlMs: 0` shares only requests already in flight. Same signature as `fetch`; GET only.
 */
const PREFIX = "get-cache:v1:";
const MAX_BYTES = 450_000;

const inflight = new Map<string, Promise<Response>>();

export async function cachedGet(url: string, init?: RequestInit & { ttlMs?: number }): Promise<Response> {
  const ttl = init?.ttlMs ?? 5 * 60_000;
  const key = PREFIX + url;
  // Two components asking for the same thing in the same moment (a mobile and a desktop layout, both mounted) share one request.
  // Not when the caller can abort: one caller's cancel must not cancel the other's answer.
  const shared = !init?.signal && inflight.get(url);
  if (shared) return shared.then((r) => r.clone());
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const hit = JSON.parse(raw) as { at: number; body: string };
      if (Date.now() - hit.at < ttl) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", "x-cache": "client" } });
      sessionStorage.removeItem(key);
    }
  } catch { /* storage blocked or malformed */ }
  const request = fetch(url, init);
  if (!init?.signal) {
    inflight.set(url, request);
    void request.finally(() => inflight.delete(url)).catch(() => undefined);
  }
  const response = await request;
  if (response.ok && ttl > 0) {
    try {
      const body = await response.clone().text();
      if (body.length < MAX_BYTES) sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), body }));
    } catch { /* quota or blocked — fine, just uncached */ }
  }
  return response;
}
