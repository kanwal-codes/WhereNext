export type WorkspaceChange = "conversation" | "preferences" | "decision" | "itinerary" | "places" | "essentials";
const eventName = "trip-workspace-changed";
export function announceWorkspaceChange(change: WorkspaceChange) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<WorkspaceChange>(eventName, { detail: change })); }
export function subscribeWorkspaceChanges(listener: () => void) { if (typeof window === "undefined") return () => undefined; const handler = () => listener(); window.addEventListener(eventName, handler); return () => window.removeEventListener(eventName, handler); }
