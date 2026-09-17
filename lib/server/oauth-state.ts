import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signed, not stored — an HMAC over the payload plus a nonce and timestamp, so the OAuth
// `state` round-trips through the third-party provider with nothing to look up server-side
// (no shared cache/DB row needed across the connect -> provider -> callback hop, which can
// land on a different instance than the one that issued it).
function secret(): string {
  const s = process.env.TOKEN_ENCRYPTION_KEY;
  if (!s) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return s;
}

export function signState(payload: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(8).toString("hex"), ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Throws on a missing/forged/expired state. `maxAgeMs` bounds how long a user has to
 *  complete the provider's consent screen before the callback is rejected. */
export function verifyState<T extends Record<string, string>>(state: string, maxAgeMs = 10 * 60_000): T {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed state");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { ts: number };
  if (Date.now() - parsed.ts > maxAgeMs) throw new Error("State expired");
  return parsed;
}
