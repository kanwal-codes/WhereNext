import { describe, expect, it, beforeAll } from "vitest";
import { decryptToken, encryptToken } from "../../lib/server/token-crypto";

describe("token-crypto", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-only-key";
  });

  it("round-trips a plaintext token", () => {
    const encrypted = encryptToken("sw-access-token-abc123");
    expect(encrypted).not.toContain("sw-access-token-abc123");
    expect(decryptToken(encrypted)).toBe("sw-access-token-abc123");
  });

  it("produces a different ciphertext each time (random iv)", () => {
    const a = encryptToken("same-value");
    const b = encryptToken("same-value");
    expect(a).not.toBe(b);
  });

  it("rejects a tampered ciphertext", () => {
    const encrypted = encryptToken("sensitive");
    const [iv, tag, ct] = encrypted.split(":");
    const hex = Buffer.from(ct, "base64").toString("hex");
    const tamperedHex = `${hex[0] === "f" ? "e" : "f"}${hex.slice(1)}`;
    const tampered = [iv, tag, Buffer.from(tamperedHex, "hex").toString("base64")].join(":");
    expect(() => decryptToken(tampered)).toThrow();
  });
});
