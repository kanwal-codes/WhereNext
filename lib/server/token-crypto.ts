import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// TOKEN_ENCRYPTION_KEY can be any secret string — hashed down to a fixed 32-byte AES-256 key so
// its exact length/encoding never matters, same as how a JWT_SECRET env var is normally set.
function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(secret).digest();
}

/**
 * AES-256-GCM encrypt for a third-party OAuth token before it goes into a text column
 * (splitwise_accounts.access_token_encrypted, migration 0024) — one self-contained base64
 * string (iv:authTag:ciphertext), so there's nothing else to store alongside it.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptToken(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}
