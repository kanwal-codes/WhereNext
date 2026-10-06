import { NextResponse } from "next/server";
import { fail } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { purgeUserFiles } from "@/lib/server/storage-cleanup";

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const admin = createSupabaseAdminClient();
    // Storage objects are not removed by the FK cascade: clear them first, while the trips that name them still exist.
    await purgeUserFiles(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return fail(error, "Your account couldn’t be deleted. Try again in a moment.");
  }
}
