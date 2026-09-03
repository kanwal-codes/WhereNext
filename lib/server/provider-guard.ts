import { logger } from "@/lib/server/logger";

/**
 * `guard(provider, fn)` / `guardedFetch(provider, ...)` — a per-provider circuit breaker
 * around one outbound call. After N consecutive failures in a window the breaker opens and
 * fails fast (so a dead/flapping provider stops burning request time and quota); a single
 * probe is allowed after a cooldown.
 *
 * In-process state, per instance. ponytail: no outbound rate-limiting here — bursts inside
 * one logical operation (e.g. Duffel's 4 calls) must not be throttled; provider QPS caps,
 * if they ever bite, belong in a queue, not a per-call reject. Move breaker state to a Redis
 * hash only if you run >1 instance and need shared tripping.
 */

export class ProviderUnavailableError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} is temporarily unavailable`);
    this.name = "ProviderUnavailableError";
  }
}

const FAIL_THRESHOLD = 5; // consecutive failures within the window before the breaker opens
const WINDOW_MS = 30_000;
const COOLDOWN_MS = 20_000;

type State = { failures: number; firstFailureAt: number; openUntil: number; halfOpen: boolean };
const states = new Map<string, State>();

function stateFor(provider: string): State {
  let s = states.get(provider);
  if (!s) {
    s = { failures: 0, firstFailureAt: 0, openUntil: 0, halfOpen: false };
    states.set(provider, s);
  }
  return s;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const isProviderFailure = (e: unknown) => !isAbort(e) && !(e instanceof ProviderUnavailableError);

export async function guard<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  const s = stateFor(provider);
  const now = Date.now();

  if (s.openUntil > now && !s.halfOpen) throw new ProviderUnavailableError(provider);
  // Cooldown elapsed → let calls through as probes (ponytail: no single-probe lock; a few may slip during recovery, harmless).
  if (s.openUntil > 0 && s.openUntil <= now) s.halfOpen = true;

  try {
    const result = await fn();
    if (s.failures || s.openUntil) logger.info({ provider }, "provider recovered");
    s.failures = 0;
    s.firstFailureAt = 0;
    s.openUntil = 0;
    s.halfOpen = false;
    return result;
  } catch (err) {
    if (!isProviderFailure(err)) throw err; // aborts / already-open don't count
    const t = Date.now();
    if (!s.firstFailureAt || t - s.firstFailureAt > WINDOW_MS) {
      s.firstFailureAt = t;
      s.failures = 1;
    } else {
      s.failures += 1;
    }
    if (s.halfOpen || s.failures >= FAIL_THRESHOLD) {
      s.openUntil = t + COOLDOWN_MS;
      s.halfOpen = false;
      logger.error({ provider, failures: s.failures }, "provider circuit opened");
    }
    throw err;
  }
}

/**
 * `fetch` wrapped in the guard for `provider`. Upstream 429/5xx are thrown so the breaker
 * counts them; other non-2xx pass through for the provider's own handling. Aborts don't count.
 */
export function guardedFetch(provider: string, input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return guard(provider, async () => {
    const response = await fetch(input, init);
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      const error = new Error(`${provider} upstream ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return response;
  });
}

export function providerGuardStats() {
  return Object.fromEntries([...states].map(([p, s]) => [p, { failures: s.failures, open: s.openUntil > Date.now() }]));
}
export function resetProviderGuards() {
  states.clear();
}
