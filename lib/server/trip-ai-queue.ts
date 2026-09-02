const queues = new Map<string, Promise<void>>();
const lastStarted = new Map<string, number>();
const MIN_START_INTERVAL_MS = 750;

async function waitForStartSlot(tripId: string) {
  const wait = Math.max(0, MIN_START_INTERVAL_MS - (Date.now() - (lastStarted.get(tripId) ?? 0)));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastStarted.set(tripId, Date.now());
}

export async function withTripAiQueue<T>(tripId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(tripId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  queues.set(tripId, chain);
  await previous;
  await waitForStartSlot(tripId);
  try { return await task(); }
  finally {
    release();
    if (queues.get(tripId) === chain) { queues.delete(tripId); lastStarted.delete(tripId); }
  }
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
