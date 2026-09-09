const queues = new Map<string, Promise<void>>();
const lastStarted = new Map<string, number>();
const MIN_START_INTERVAL_MS = 750;

async function waitForStartSlot(tripId: string) {
  const wait = Math.max(0, MIN_START_INTERVAL_MS - (Date.now() - (lastStarted.get(tripId) ?? 0)));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastStarted.set(tripId, Date.now());
}

export async function withTripAiStream(tripId: string, task: () => Promise<ReadableStream<Uint8Array>>): Promise<ReadableStream<Uint8Array>> {
  const previous = queues.get(tripId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  queues.set(tripId, chain);
  await previous;
  await waitForStartSlot(tripId);
  try {
    const stream = await task();
    const reader = stream.getReader();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) { controller.close(); release(); if (queues.get(tripId) === chain) { queues.delete(tripId); lastStarted.delete(tripId); } }
          else controller.enqueue(result.value);
        } catch (error) { controller.error(error); release(); if (queues.get(tripId) === chain) { queues.delete(tripId); lastStarted.delete(tripId); } }
      },
      async cancel(reason) { await reader.cancel(reason); release(); if (queues.get(tripId) === chain) { queues.delete(tripId); lastStarted.delete(tripId); } },
    });
  } catch (error) {
    release();
    if (queues.get(tripId) === chain) { queues.delete(tripId); lastStarted.delete(tripId); }
    throw error;
  }
}

/**
 * Same per-trip queue + rate-limit slot as `withTripAiStream`, for a caller that resolves a
 * plain value instead of teeing a stream (the buffered group-chat @Roam compose call). A
 * separate function rather than a shared abstraction — `withTripAiStream`'s release timing is
 * tied to the returned stream being fully read/cancelled, not to the task itself resolving, so
 * unifying them would be a bigger, riskier diff than this one small sibling.
 */
export async function withTripAiTask<T>(tripId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(tripId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  queues.set(tripId, chain);
  await previous;
  await waitForStartSlot(tripId);
  try {
    return await task();
  } finally {
    release();
    // Unlike withTripAiStream's cleanup, `lastStarted` is deliberately kept — a buffered task has
    // no "still draining" phase to defer this past, so clearing it here would let every very-next
    // call for the trip skip the throttle entirely, the moment after each call finishes.
    if (queues.get(tripId) === chain) queues.delete(tripId);
  }
}
