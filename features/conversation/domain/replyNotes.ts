/** Human names for the providers RETRIEVE may report as unavailable. */
const PROVIDER_LABEL: Record<string, string> = {
  liteapi: "hotel rates",
  duffel: "flight fares",
  ticketmaster: "events",
  eventbrite: "events",
  "google-routes": "transit",
  "transit-app": "transit",
  mapbox: "directions",
  openweather: "the weather",
  tavily: "the web",
  "google-places": "places",
};

const unavailableLabels = (names?: string[]) => Array.from(new Set((names ?? []).map((name) => PROVIDER_LABEL[name] ?? name)));

/** "www.example.com/path" → "example.com": which site a source is, at a glance. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export type ReplyNote = { text: string; tone: "neutral" | "caution" | "destructive" };

/** The one quiet note under a settled reply, instead of a stack of separate grey lines. Nothing while it is still streaming. */
export function replyNotes(meta: { degraded?: boolean; persistFailed?: boolean; truncated?: boolean; unavailableProviders?: string[] } | undefined, streaming: boolean): ReplyNote[] {
  if (streaming) return [];
  const notes: ReplyNote[] = [];
  if (meta?.degraded) notes.push({ text: "Answered from your trip details — the planner had trouble reading that one. Rephrasing may help.", tone: "neutral" });
  if (meta?.persistFailed) notes.push({ text: "This reply wasn’t saved — it may be gone if you reload.", tone: "destructive" });
  if (meta?.truncated) notes.push({ text: "This answer may have been cut off — ask again if it looks incomplete.", tone: "neutral" });
  const unavailable = unavailableLabels(meta?.unavailableProviders);
  if (unavailable.length > 0) notes.push({ text: `Couldn’t check ${unavailable.join(", ")} just now — this is from your trip so far.`, tone: "neutral" });
  return notes;
}
