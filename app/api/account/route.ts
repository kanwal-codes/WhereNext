import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Account could not be deleted" }, { status: 503 });
  }
}
