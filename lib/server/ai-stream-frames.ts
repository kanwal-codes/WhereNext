export const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" };

const encoder = new TextEncoder();
export const doneFrame = encoder.encode("data: [DONE]\n\n");
export const textFrame = (content: string) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
/** Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): a real, backend-driven milestone the
 *  client can show progress for, instead of the fixed-timer guess the UI used before this. Not
 *  RESOLVE's field-level partial JSON (that's `onPartial` in `turn-resolver.ts`/`gateway.ts`,
 *  built but not wired to the wire format here) — three coarse, always-true stages are enough to
 *  turn "blank for up to ~15s" into "labeled, updates as the turn actually progresses." */
/** What Roam says it is doing for each tool RESOLVE can plan, so the "retrieve" progress frame says
 *  what is actually being looked up. Voice: a travel companion thinking out loud. Lower-case present
 *  participles, concrete, no jargon ("sources", "live data"), and no repeated verb when two are joined
 *  ("finding places and looking at stays"). The client capitalises it and adds the ellipsis. */
const TOOL_PROGRESS_LABEL: Record<string, string> = {
  search_places: "finding places",
  research_web: "reading up on it",
  weather: "checking the forecast",
  events: "seeing what's on",
  flights: "comparing flights",
  directions: "plotting the route",
  stays: "looking at stays",
};
/** At most 2 named activities — RESOLVE can plan up to `MAX_TOOL_CALLS`, but "checking places,
 *  checking hotels, getting directions and checking the weather…" reads as noise, not progress.
 *  `undefined` (no tools, or none with a label) leaves the client's own generic text in place. */
export function toolProgressLabel(tools: string[]): string | undefined {
  const labels = [...new Set(tools.map((t) => TOOL_PROGRESS_LABEL[t]).filter((l): l is string => Boolean(l)))].slice(0, 2);
  if (labels.length === 0) return undefined;
  return labels.length === 1 ? labels[0] : `${labels[0]} and ${labels[1]}`;
}
export const progressFrame = (stage: "resolve" | "retrieve" | "compose", label?: string) =>
  encoder.encode(`data: ${JSON.stringify(label ? { progress: stage, label } : { progress: stage })}\n\n`);
// An ordinary client disconnect now actively aborts RESOLVE/RETRIEVE and every in-flight COMPOSE
// attempt (see `combinedAbort` below) — without this check, every routine tab-close would log as
// an error. `streamText`'s own thrown/reported errors aren't always a `DOMException`, so check
// `.name` too (matches the same lenient pattern `packages/ai/gateway.ts`'s `isAbort` uses).
export const isAbortError = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

/** Tells the client the reply stopped early, so what it has is flagged rather than kept as a complete answer. */
export const truncatedFrame = () => encoder.encode(`data: ${JSON.stringify({ truncated: true })}\n\n`);
