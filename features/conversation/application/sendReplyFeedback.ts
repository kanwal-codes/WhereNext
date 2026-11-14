import type { ReplyRating } from "../domain/replyFeedback";

/** Sets, changes or (rating null) clears the traveller's thumbs on a Roam reply. Throws when the server did not take it. */
export async function sendReplyFeedback(tripId: string, messageId: string, rating: ReplyRating | null, note?: string): Promise<void> {
  const response = await fetch(`/api/trips/${tripId}/conversation/feedback`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messageId, rating, note }),
  });
  if (!response.ok) throw new Error(`feedback ${response.status}`);
}
