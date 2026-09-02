import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function member(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const result = await supabase.from("trip_members").select("trip_id,role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  return result.data && result.data.role !== "viewer" ? supabase : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const tripId = (await params).tripId; const supabase = await member(tripId); if (!supabase) return NextResponse.json({ error: "Trip access denied" }, { status: 403 }); const result = await supabase.from("trip_essentials").select("completed,updated_at").eq("trip_id", tripId).maybeSingle(); if (result.error) throw result.error; return NextResponse.json({ completed: result.data?.completed ?? [], updatedAt: result.data?.updated_at ?? null }); } catch { return NextResponse.json({ error: "Essentials unavailable" }, { status: 503 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const tripId = (await params).tripId; const supabase = await member(tripId); if (!supabase) return NextResponse.json({ error: "Trip access denied" }, { status: 403 }); const parsed = z.object({ completed: z.array(z.string().min(1).max(240)).max(50) }).safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid essentials" }, { status: 400 }); const result = await supabase.from("trip_essentials").upsert({ trip_id: tripId, completed: parsed.data.completed }).select("completed,updated_at").single(); if (result.error) throw result.error; return NextResponse.json(result.data); } catch { return NextResponse.json({ error: "Essentials unavailable" }, { status: 503 }); }
}
