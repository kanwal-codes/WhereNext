import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/server/bearer";
import { fail } from "@/lib/server/with-route";
import { logger } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearRateLimits } from "@/lib/server/rate-limit";
import { guestLimiterKeys } from "@/lib/server/guest";

export const runtime = "nodejs";

/** A guest older than this is abandoned: the reload guard already wipes an active one. */
const GUEST_TTL_MS = 6 * 60 * 60_000;
const PAGE = 200;
/** ponytail: Auth has no server-side filter for anonymous users, so this pages through users.
 *  50 pages covers 10k accounts per run; at that size move it to a SQL function on a schedule. */
const MAX_PAGES = 50;

/**
 * Daily sweep of abandoned guest sessions (closed the tab without reloading, so the reset
 * endpoint never ran). Deleting the anonymous user cascades to its trip and conversation.
 * Auth matches the other crons: `Authorization: Bearer $CRON_SECRET`.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!hasBearer(request, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = createSupabaseAdminClient();
    const cutoff = Date.now() - GUEST_TTL_MS;
    let scanned = 0;
    let deleted = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) throw error;
      const users = data.users;
      scanned += users.length;
      for (const user of users) {
        if (!user.is_anonymous || new Date(user.created_at).getTime() > cutoff) continue;
        const result = await admin.auth.admin.deleteUser(user.id);
        if (result.error) logger.warn({ err: result.error, cron: "guest-cleanup", userId: user.id }, "couldn't delete stale guest");
        else {
          deleted += 1;
          await clearRateLimits(guestLimiterKeys(user.id)).catch(() => undefined);
        }
      }
      if (users.length < PAGE) break;
    }
    return NextResponse.json({ scanned, deleted });
  } catch (error) {
    return fail(error, "Guest cleanup failed");
  }
}

export const GET = run;
export const POST = run;
