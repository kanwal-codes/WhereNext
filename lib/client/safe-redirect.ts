/**
 * An internal-only path from a `redirect`/`next` query param, or `fallback` if it's missing or
 * looks like an open-redirect attempt (`//host/...` parses as protocol-relative, not a path).
 * Shared by sign-in, sign-up, and the auth callback so a pending invite (`/join/[token]`) or any
 * other deep link survives every account-creation path, not just the ones that happened to
 * reimplement this check themselves.
 */
export function safeRedirect(value: string | null | undefined, fallback: string): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
