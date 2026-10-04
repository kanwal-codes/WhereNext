/**
 * An internal-only path from a `redirect`/`next` query param, or `fallback` if it's missing or
 * looks like an open-redirect attempt (`//host/...` parses as protocol-relative, not a path).
 * Shared by sign-in, sign-up, and the auth callback so a pending invite (`/join/[token]`) or any
 * other deep link survives every account-creation path, not just the ones that happened to
 * reimplement this check themselves.
 */
export function safeRedirect(value: string | null | undefined, fallback: string): string {
  // Browsers read a backslash as a slash (`/\evil.com` and `/<tab>/evil.com` both land on evil.com), so those are refused
  // outright; anything left must still resolve to this site once parsed.
  if (!value || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    return new URL(value, "http://internal.invalid").origin === "http://internal.invalid" ? value : fallback;
  } catch {
    return fallback;
  }
}
