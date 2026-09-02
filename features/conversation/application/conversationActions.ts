export async function persistUserMessage(tripId: string, content: string, idempotencyKey: string) {
  const response = await fetch(`/api/trips/${tripId}/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "user", content, idempotencyKey }),
  });
  if (!response.ok) {
    const detail = await response.json().then((b) => (b && typeof b.error === "string" ? b.error : null)).catch(() => null);
    throw new Error(detail ? `save: ${response.status} ${detail}` : `save: ${response.status}`);
  }
  return idempotencyKey;
}
