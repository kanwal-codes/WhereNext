import { NextResponse } from "next/server";
import { decisionInput } from "@/features/trip/domain/decision";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function authorized(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const member = await supabase.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", user.id).maybeSingle();
  return member.data ? supabase : false;
}

export async function GET(_: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const tripId = (await params).tripId; const supabase = await authorized(tripId); if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const result = await supabase.from("trip_decisions").select("id,kind,value,source,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }); if (result.error) throw result.error; return NextResponse.json({ decisions: result.data ?? [] }); } catch { return NextResponse.json({ error: "Decisions unavailable" }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const tripId = (await params).tripId; const supabase = await authorized(tripId); if (!supabase) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const parsed = decisionInput.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 }); const decision = { trip_id: tripId, kind: parsed.data.kind, value: parsed.data.value, source: parsed.data.source, ...(parsed.data.idempotencyKey ? { idempotency_key: parsed.data.idempotencyKey } : {}) }; const result = parsed.data.idempotencyKey ? await supabase.from("trip_decisions").upsert(decision, { onConflict: "trip_id,idempotency_key" }).select("id,kind,value,source,created_at").single() : await supabase.from("trip_decisions").insert(decision).select("id,kind,value,source,created_at").single(); if (result.error) throw result.error; return NextResponse.json({ decision: result.data }, { status: 201 }); } catch { return NextResponse.json({ error: "Decision could not be saved" }, { status: 503 }); }
}
