import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/server/token-crypto";
import { refreshAccessToken } from "@/packages/providers/splitwise/client";
import { logger } from "@/lib/server/logger";

/** The caller's own decrypted, live Splitwise access token — refreshed and re-persisted first
 *  if it's past its recorded expiry and a refresh token is on file. Null if never connected. */
export async function liveSplitwiseAccessToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const account = await supabase
    .from("splitwise_accounts")
    .select("access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (account.error) throw account.error;
  if (!account.data) return null;

  const expired = account.data.token_expires_at ? new Date(account.data.token_expires_at).getTime() < Date.now() : false;
  if (!expired) return decryptToken(account.data.access_token_encrypted);
  if (!account.data.refresh_token_encrypted) return decryptToken(account.data.access_token_encrypted); // best-effort, may already be rejected by Splitwise

  try {
    const refreshed = await refreshAccessToken(decryptToken(account.data.refresh_token_encrypted));
    await supabase
      .from("splitwise_accounts")
      .update({
        access_token_encrypted: encryptToken(refreshed.accessToken),
        refresh_token_encrypted: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : account.data.refresh_token_encrypted,
        token_expires_at: refreshed.expiresAt,
      })
      .eq("user_id", userId);
    return refreshed.accessToken;
  } catch (error) {
    logger.warn({ err: error, userId }, "splitwise token refresh failed; falling back to the stored (expired) token");
    return decryptToken(account.data.access_token_encrypted);
  }
}
