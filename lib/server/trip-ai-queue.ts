const queues = new Map<string, Promise<void>>();
const lastStarted = new Map<string, number>();
const MIN_START_INTERVAL_MS = 750;

// Scoped per (trip, user), not per trip alone. Two different members write their own message
// row under their own idempotency key, so nothing about their turns actually races — keying by
// trip alone meant one member's whole COMPOSE call (often several seconds) blocked a completely
// unrelated member's reply on the same trip. This still protects the real target: a double-
// click or a client retry racing itself for the SAME (trip, user).
function queueKey(tripId: string, userId: string): string {
  return `${tripId}:${userId}`;
}

async function waitForStartSlot(key: string) {
  const wait = Math.max(0, MIN_START_INTERVAL_MS - (Date.now() - (lastStarted.get(key) ?? 0)));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastStarted.set(key, Date.now());
}

export async function withTripAiStream(tripId: string, userId: string, task: () => Promise<ReadableStream<Uint8Array>>): Promise<ReadableStream<Uint8Array>> {
  const key = queueKey(tripId, userId);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  queues.set(key, chain);
  await previous;
  await waitForStartSlot(key);
  try {
    const stream = await task();
    const reader = stream.getReader();
    // `pull()`'s `reader.read()` await can still be in flight when `cancel()` fires — once that
    // happens the wrapper stream has already left the "readable" state, so a stale
    // `controller.close/enqueue/error` call afterward would throw a TypeError instead of the
    // harmless no-op it should be.
    let cancelled = false;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (cancelled) return;
          if (result.done) { controller.close(); release(); if (queues.get(key) === chain) { queues.delete(key); lastStarted.delete(key); } }
          else controller.enqueue(result.value);
        } catch (error) {
          if (cancelled) return;
          controller.error(error); release(); if (queues.get(key) === chain) { queues.delete(key); lastStarted.delete(key); }
        }
      },
      async cancel(reason) { cancelled = true; await reader.cancel(reason); release(); if (queues.get(key) === chain) { queues.delete(key); lastStarted.delete(key); } },
    });
  } catch (error) {
    release();
    if (queues.get(key) === chain) { queues.delete(key); lastStarted.delete(key); }
    throw error;
  }
}

/**
 * Same per-(trip, user) queue + rate-limit slot as `withTripAiStream`, for a caller that
 * resolves a plain value instead of teeing a stream (the buffered group-chat @Roam compose
 * call). A separate function rather than a shared abstraction — `withTripAiStream`'s release
 * timing is tied to the returned stream being fully read/cancelled, not to the task itself
 * resolving, so unifying them would be a bigger, riskier diff than this one small sibling.
 */
export async function withTripAiTask<T>(tripId: string, userId: string, task: () => Promise<T>): Promise<T> {
  const key = queueKey(tripId, userId);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  queues.set(key, chain);
  await previous;
  await waitForStartSlot(key);
  try {
    return await task();
  } finally {
    release();
    // Unlike withTripAiStream's cleanup, `lastStarted` is deliberately kept — a buffered task has
    // no "still draining" phase to defer this past, so clearing it here would let every very-next
    // call for the same (trip, user) skip the throttle entirely, the moment after each call finishes.
    if (queues.get(key) === chain) queues.delete(key);
  }
}
