import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyState } from "@/lib/server/oauth-state";
import { exchangeCode, getCurrentUser } from "@/packages/providers/splitwise/client";
import { encryptToken } from "@/lib/server/token-crypto";
import { logger } from "@/lib/server/logger";
import { invalidateWorkspace } from "@/lib/server/workspace-cache";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const backTo = (tripId: string | null, message?: string) => {
    const url = new URL(tripId ? `${origin}/trips/${tripId}/bookings` : `${origin}/trips`);
    if (message) url.searchParams.set("splitwiseError", message);
    return NextResponse.redirect(url);
  };

  let tripId: string | null = null;
  try {
    const state = searchParams.get("state");
    if (!state) return backTo(null, "That Splitwise link has expired — try connecting again.");
    const parsed = verifyState<{ tripId: string; userId: string }>(state);
    tripId = parsed.tripId;

    if (searchParams.get("error")) return backTo(tripId, "Splitwise connection was cancelled.");
    const code = searchParams.get("code");
    if (!code) return backTo(tripId, "Splitwise didn't return an authorization code.");

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== parsed.userId) return backTo(tripId, "Sign in as the same account that started this, then try again.");

    const redirectUri = `${origin}/api/splitwise/callback`;
    const token = await exchangeCode(code, redirectUri);
    const swUser = await getCurrentUser(token.accessToken);

    const upserted = await supabase.from("splitwise_accounts").upsert({
      user_id: user.id,
      splitwise_user_id: String(swUser.id),
      access_token_encrypted: encryptToken(token.accessToken),
      refresh_token_encrypted: token.refreshToken ? encryptToken(token.refreshToken) : null,
      token_expires_at: token.expiresAt,
    });
    if (upserted.error) throw upserted.error;

    invalidateWorkspace(tripId);
    const success = new URL(`${origin}/trips/${tripId}/bookings`);
    success.searchParams.set("splitwiseConnected", "1");
    return NextResponse.redirect(success);
  } catch (error) {
    logger.error({ err: error, tripId }, "splitwise callback failed");
    return backTo(tripId, "Couldn't finish connecting Splitwise. Try again in a moment.");
  }
}
