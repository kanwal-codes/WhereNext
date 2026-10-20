import { HttpError } from "../domain/outbox";

export async function postJson<T>(url: string, body: unknown, timeoutMs?: number): Promise<T> {
  const controller = timeoutMs != null ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller?.signal });
    if (!response.ok) throw new HttpError(response.status);
    return response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
