import { revalidateTag, unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTripWorkspace, type TripWorkspaceData } from "@/features/workspace/application/loadTripWorkspace";
import { invalidate } from "@/lib/server/ttl-cache";

const workspaceTag = (tripId: string) => `trip-workspace:${tripId}`;

// The trip's workspace snapshot is identical for every member, so it's cached across requests
// and busted by the `revalidateTag(workspaceTag(id))` mutation routes fire. Uses the service
// client because `unstable_cache` must not close over cookie-scoped state — the caller checks
// membership before this runs. `revalidate` is only a backstop for changes that bypass a
// mutation route; tag invalidation carries the normal case. Deliberately doesn't swallow errors —
// a caught failure would get cached as a successful `null` for the full `revalidate` window,
// turning one transient DB hiccup into two minutes of false 404s; callers fall back themselves.
// Cache key includes userId because the conversation slice (personal thread) is per-member, not
// identical across the trip — the rest of the snapshot still is, but splitting the cache further
// than per-(trip,user) isn't worth it. `revalidateTag` still busts every user's cached entry for
// the trip at once, since the tag stays trip-scoped.
//
// Shared by the trip layout (every page navigation) and the /workspace API route (hit by the
// client's offline-mirror priming on every mount and after every mutation) — the route used to
// read straight from the database every time, bypassing this cache entirely and doing a second
// full DB read right as the page's own re-render was already re-fetching the identical data.
export function loadWorkspaceCached(tripId: string, userId: string): Promise<TripWorkspaceData | null> {
  return unstable_cache(
    () => loadTripWorkspace(createSupabaseAdminClient(), tripId, userId),
    ["trip-workspace", tripId, userId],
    { revalidate: 120, tags: [workspaceTag(tripId)] },
  )();
}

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
  // Busts loadTripContext's short-TTL cache (lib/application/trip-context.ts) too — a
  // completely separate cache from the unstable_cache above, but every mutation route already
  // calls this one function, so it's the one place both need clearing from.
  void invalidate(`trip-context:${tripId}`);
  // Same reasoning for the trip-review findings cache (app/api/trips/[tripId]/review/route.ts)
  // — it wraps loadTripContext + reviewTrip in its OWN 10-minute cache with no bust hook of its
  // own anywhere in the codebase, so an itinerary/stay/budget change kept the review widget
  // showing stale findings ("no itinerary yet", "stay not booked") for up to 10 minutes after
  // the thing it was complaining about was actually fixed.
  void invalidate(`review:${tripId}`);
}
