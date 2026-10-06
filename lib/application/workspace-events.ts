export type WorkspaceChange = "trip" | "conversation" | "preferences" | "decision" | "itinerary" | "places" | "essentials" | "groupChat" | "availability" | "expenses" | "members";
const eventName = "trip-workspace-changed";
/** A burst of realtime writes can touch several change types at once (e.g. a saved place also
 *  updates the itinerary) — dispatched as one event carrying all of them, so a listener that
 *  treats any change as "refetch everything" (TripDataProvider) fires once per burst instead of
 *  once per type, and a listener that only cares about one type (group chat) can tell them apart. */
// A write made in this tab is announced at once, and Supabase Realtime then echoes the same row change back a moment
// later. Without this, every action ran the whole refresh cascade twice (a server render of the trip, the offline
// mirror, each listener's refetch). `source: "realtime"` drops a type this tab already announced itself a moment ago.
// ponytail: a collaborator's edit of the same type inside that window is also dropped; the next change picks it up.
const localAt = new Map<WorkspaceChange, number>();
export const ECHO_WINDOW_MS = 2000;
export function announceWorkspaceChanges(changes: WorkspaceChange[], source: "local" | "realtime" = "local") {
  const now = Date.now();
  if (source === "local") for (const change of changes) localAt.set(change, now);
  else changes = changes.filter((change) => now - (localAt.get(change) ?? -Infinity) > ECHO_WINDOW_MS);
  if (typeof window !== "undefined" && changes.length > 0) window.dispatchEvent(new CustomEvent<WorkspaceChange[]>(eventName, { detail: changes }));
}
export function announceWorkspaceChange(change: WorkspaceChange) { announceWorkspaceChanges([change]); }
export function subscribeWorkspaceChanges(listener: (changes: WorkspaceChange[]) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<WorkspaceChange[]>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
