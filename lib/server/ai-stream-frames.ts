export const SSE_HEADERS = { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" };

const encoder = new TextEncoder();
export const doneFrame = encoder.encode("data: [DONE]\n\n");
export const textFrame = (content: string) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
/** Phase 2.6.2 (docs/overhaul/roadmap/phase-2-speed.md): a real, backend-driven milestone the
 *  client can show progress for, instead of the fixed-timer guess the UI used before this. Not
 *  RESOLVE's field-level partial JSON (that's `onPartial` in `turn-resolver.ts`/`gateway.ts`,
 *  built but not wired to the wire format here) — three coarse, always-true stages are enough to
 *  turn "blank for up to ~15s" into "labeled, updates as the turn actually progresses." */
/** What Roam says it is doing for each thing RESOLVE planned to look up, so the "retrieve" progress frame names the real work, with the
 *  place or route when there is one ("finding places in Ibiza", "comparing flights Toronto to Ibiza"). Voice: a travel companion thinking
 *  out loud. Lower-case present participles, concrete, no jargon. The client capitalises each line, adds the ellipsis and cycles through them. */
type PlannedCall = { tool: string; location?: string; origin?: string; destination?: string; from?: string; to?: string };
const town = (text: string | undefined) => text?.split(",")[0]?.trim() || undefined;
const inTown = (text: string | undefined) => (town(text) ? ` in ${town(text)}` : "");
const STEP: Record<string, (call: PlannedCall) => string> = {
  search_places: (c) => `finding places${inTown(c.location)}`,
  research_web: () => "reading up on it",
  weather: (c) => `checking the forecast${inTown(c.location)}`,
  events: (c) => `seeing what's on${inTown(c.location)}`,
  flights: (c) => (town(c.origin) && town(c.destination) ? `comparing flights ${town(c.origin)} to ${town(c.destination)}` : "comparing flights"),
  directions: (c) => (town(c.from) && town(c.to) ? `plotting the route ${town(c.from)} to ${town(c.to)}` : "plotting the route"),
  stays: (c) => `looking at stays${inTown(c.location)}`,
};
/** One line per kind of look-up, in the order planned (several searches of one kind read as one line); at most 4. */
export function toolSteps(calls: PlannedCall[]): string[] {
  const seen = new Set<string>();
  const steps: string[] = [];
  for (const call of calls) {
    if (seen.has(call.tool) || !STEP[call.tool]) continue;
    seen.add(call.tool);
    steps.push(STEP[call.tool](call));
  }
  return steps.slice(0, 4);
}
/** What Roam is building once the look-ups are back; `undefined` when the answer is only written (the client says "deciding what fits you"). */
export function buildStep(capabilities: readonly string[] = []): string | undefined {
  if (capabilities.includes("itinerary")) return "planning your days";
  if (capabilities.includes("budget")) return "working out the costs";
  if (capabilities.includes("comparison")) return "weighing the options";
  return undefined;
}
export const progressFrame = (stage: "resolve" | "retrieve" | "decide" | "compose", label?: string) =>
  encoder.encode(`data: ${JSON.stringify(label ? { progress: stage, label } : { progress: stage })}\n\n`);
// An ordinary client disconnect now actively aborts RESOLVE/RETRIEVE and every in-flight COMPOSE
// attempt (see `combinedAbort` below) — without this check, every routine tab-close would log as
// an error. `streamText`'s own thrown/reported errors aren't always a `DOMException`, so check
// `.name` too (matches the same lenient pattern `packages/ai/gateway.ts`'s `isAbort` uses).
export const isAbortError = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

/** Tells the client the reply stopped early, so what it has is flagged rather than kept as a complete answer. */
export const truncatedFrame = () => encoder.encode(`data: ${JSON.stringify({ truncated: true })}\n\n`);
