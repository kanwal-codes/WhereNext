import { NextResponse } from "next/server";
import { fail, withRoute } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clearRateLimits } from "@/lib/server/rate-limit";
import { guestLimiterKeys, isGuest } from "@/lib/server/guest";
import { purgeUserFiles } from "@/lib/server/storage-cleanup";

/**
 * Throws a guest's session away: deletes the anonymous user (every trip, message and decision
 * hangs off `auth.users` with `on delete cascade`, so nothing is left behind) and signs the
 * browser out. This is what makes a guest chat disposable: a reload or a fresh tab calls it.
 *
 * It only ever acts on the caller's own anonymous session. A registered account is refused, so
 * this can never be used to delete a real user.
 */
export const POST = withRoute(async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });
    if (!isGuest(user)) return NextResponse.json({ error: "Only guest sessions can be reset." }, { status: 403 });

    const admin = createSupabaseAdminClient();
    await purgeUserFiles(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    // Their own limiter counters go with them (their IP's do not: those outlive the guest).
    await clearRateLimits(guestLimiterKeys(user.id)).catch(() => undefined);
    // The user no longer exists, so this only clears the browser's cookies.
    await supabase.auth.signOut().catch(() => undefined);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fail(error, "Couldn't clear this guest session.");
  }
});
