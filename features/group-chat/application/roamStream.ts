import { HttpError } from "../domain/outbox";

/**
 * Asks Roam to answer one message and hands the words over as they are written (`onText` gets everything so far).
 * Resolves when the reply is saved; rejects when it is not (an HTTP error, a reply that stopped part-way, a dead connection).
 * An answer that is plain JSON (a retry that finds its reply already saved, or a card-only reply) counts as done.
 */
export async function askRoamStreaming(url: string, body: Record<string, unknown>, timeoutMs: number, onText: (soFar: string) => void): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, stream: true }), signal: controller.signal });
    if (!response.ok) throw new HttpError(response.status);
    if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let written = "";
    let saved = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const parts = buffered.split("\n\n");
      buffered = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ") || part === "data: [DONE]") continue;
        let frame: { choices?: Array<{ delta?: { content?: string } }>; message?: unknown; error?: boolean };
        try { frame = JSON.parse(part.slice(6)); } catch { continue; }
        if (frame.error) throw new Error("Roam could not finish the reply");
        if (frame.message) saved = true;
        const piece = frame.choices?.[0]?.delta?.content;
        if (piece) { written += piece; onText(written); }
      }
    }
    // The stream ended without the saved reply: the connection dropped part-way.
    if (!saved) throw new Error("the reply stopped part-way");
  } finally {
    clearTimeout(timer);
  }
}
