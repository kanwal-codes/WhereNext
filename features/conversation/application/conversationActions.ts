export async function persistUserMessage(tripId: string, content: string, idempotencyKey: string) {
  const response = await fetch(`/api/trips/${tripId}/conversation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "user", content, idempotencyKey }),
  });
  if (!response.ok) throw new Error("save");
  return idempotencyKey;
}
