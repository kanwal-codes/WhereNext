export type WorkspaceChange = "trip" | "conversation" | "preferences" | "decision" | "itinerary" | "places" | "essentials" | "groupChat" | "availability" | "expenses" | "members";
const eventName = "trip-workspace-changed";
/** A burst of realtime writes can touch several change types at once (e.g. a saved place also
 *  updates the itinerary) — dispatched as one event carrying all of them, so a listener that
 *  treats any change as "refetch everything" (TripDataProvider) fires once per burst instead of
 *  once per type, and a listener that only cares about one type (group chat) can tell them apart. */
export function announceWorkspaceChanges(changes: WorkspaceChange[]) {
  if (typeof window !== "undefined" && changes.length > 0) window.dispatchEvent(new CustomEvent<WorkspaceChange[]>(eventName, { detail: changes }));
}
export function announceWorkspaceChange(change: WorkspaceChange) { announceWorkspaceChanges([change]); }
export function subscribeWorkspaceChanges(listener: (changes: WorkspaceChange[]) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<WorkspaceChange[]>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
