import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context, threaded through a single route invocation via AsyncLocalStorage.
 * Seeded by `withRoute` (lib/server/with-route.ts) and merged into every `logger` line.
 * Node runtime only — never referenced from `middleware.ts` or an edge route.
 */
export type RequestContext = {
  requestId: string;
  route?: string;
  method?: string;
  tripId?: string;
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(seed: RequestContext, fn: () => T): T {
  return storage.run(seed, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Mutate the live context object (e.g. attach `tripId`/`userId` once auth resolves). */
export function setContext(partial: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, partial);
}
