/** Roam asking again and again for the same missing detail reads as nagging: the traveller already heard the question. */
const ASKS_FOR_DATES = /\b(?:what|which|rough|exact)\s+dates?\b|\bwhen\s+(?:are|do|will|would)\s+you\b|\bhow\s+(?:long|many\s+(?:days|nights))\b|\btravel\s+dates?\b|\bdates?\s+(?:are|do)\s+you\b/i;

/** Whether one of Roam's last few replies already asked for the trip's dates or length. */
export function askedForDatesRecently(history: Array<{ role: "user" | "assistant"; content: string }>, window = 6): boolean {
  return history.slice(-window).some((turn) => turn.role === "assistant" && turn.content.includes("?") && ASKS_FOR_DATES.test(turn.content));
}
