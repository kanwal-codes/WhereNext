import { revalidateTag } from "next/cache";

export const workspaceTag = (tripId: string) => `trip-workspace:${tripId}`;

/**
 * Best-effort workspace-cache bust. `revalidateTag` is only valid inside a request /
 * Server Action context; when the assistant stream persists its final message the
 * request has already returned and this runs in a detached async tick, where
 * `revalidateTag` throws "static generation store missing". Swallow that — the chat
 * client already updates from the stream, and the next navigation re-runs
 * `loadTripWorkspace` regardless. Real route handlers still get a live revalidation.
 */
export function invalidateWorkspace(tripId: string): void {
  try {
    revalidateTag(workspaceTag(tripId));
  } catch {
    /* outside a request context — skip */
  }
}
