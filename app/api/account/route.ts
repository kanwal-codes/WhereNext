import { NextResponse } from "next/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { purgeUserFiles } from "@/lib/server/storage-cleanup";

export const DELETE = withRoute(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    // Trips this person owns that other people are on move to the longest-standing other member first;
    // only trips with nobody else on them go away with the account (the FK cascade).
    const handover = await admin.rpc("transfer_owned_trips", { p_user: user.id });
    if (handover.error) throw handover.error;
    // Storage objects are not removed by the FK cascade: clear them first, while the trips that name them still exist.
    await purgeUserFiles(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return fail(error, "Your account couldn’t be deleted. Try again in a moment.");
  }
});
