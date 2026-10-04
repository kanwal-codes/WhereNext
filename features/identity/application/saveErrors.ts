/** What went wrong while a guest was saving their trip, in the terms the card acts on. */
export type SaveFailure = {
  kind: "exists" | "wrong-password" | "unconfirmed" | "weak" | "bad-email" | "rate" | "session" | "network" | "other";
  /** Plain words for the person, ready to show. */
  message: string;
};

type AuthLike = { code?: string; status?: number; name?: string; message?: string } | null | undefined;

/** Maps a Supabase auth error to a `SaveFailure`. Codes first (they are stable); the message only as a fallback. */
export function describeAuthError(error: AuthLike): SaveFailure {
  const code = error?.code ?? "";
  const text = error?.message ?? "";
  const has = (re: RegExp) => re.test(text);

  if (code === "email_exists" || code === "user_already_exists" || has(/already (been )?registered/i))
    return { kind: "exists", message: "That email already has an account." };
  if (code === "invalid_credentials" || has(/invalid login credentials/i))
    return { kind: "wrong-password", message: "That password doesn’t match. If you signed up with Google, use Continue with Google." };
  if (code === "email_not_confirmed" || has(/email not confirmed/i))
    return { kind: "unconfirmed", message: "That account’s email isn’t confirmed yet." };
  if (code === "weak_password" || has(/password (is )?(too )?(weak|short|should)/i))
    return { kind: "weak", message: "Choose a stronger password: at least 8 characters, and not a common one." };
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429)
    return { kind: "rate", message: "Too many tries. Wait a minute and try again." };
  if (code === "email_address_invalid" || code === "validation_failed" || has(/unable to validate email|invalid format|email address .* is invalid/i))
    return { kind: "bad-email", message: "That email doesn’t look right. Check it and try again." };
  if (code === "session_not_found" || code === "user_not_found" || code === "refresh_token_not_found" || has(/auth session missing|session.*(not found|missing)/i))
    return { kind: "session", message: "This guest chat has ended, so there’s nothing to save." };
  if (error?.status === 0 || error?.name === "AuthRetryableFetchError" || has(/failed to fetch|network|load failed/i))
    return { kind: "network", message: "Can’t reach Where Next. Check your connection and try again." };
  return { kind: "other", message: "Something went wrong. Please try again." };
}
