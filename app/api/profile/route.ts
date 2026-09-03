import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { travelerProfileSchema } from "@/packages/contracts/profile";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const result = await supabase.from("profiles").select("data,updated_at").eq("id", user.id).maybeSingle();
    if (result.error) throw result.error;
    return NextResponse.json({ profile: result.data?.data ?? {}, updatedAt: result.data?.updated_at ?? null });
  } catch (error) {
    return fail(error, "Your profile is unavailable right now.");
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const update = travelerProfileSchema.parse(await request.json());
    const existing = await supabase.from("profiles").select("data").eq("id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    const merged = travelerProfileSchema.parse({ ...(existing.data?.data ?? {}), ...update });
    const result = await supabase.from("profiles").upsert({ id: user.id, data: merged }).select("data,updated_at").single();
    if (result.error) throw result.error;
    return NextResponse.json({ profile: result.data.data, updatedAt: result.data.updated_at });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    return fail(error, "Your profile couldn’t be saved. Try again in a moment.");
  }
}
