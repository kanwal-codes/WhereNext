import { NextResponse } from "next/server";
import { fail } from "@/lib/server/with-route";
import { createTripInput } from "@/features/trip/domain/trip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTripRepository } from "@/features/trip/infrastructure/tripRepository";
import { createTrip } from "@/features/trip/application/createTrip";

export async function POST(request: Request) {
  const parsed = createTripInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid trip" }, { status: 400 });
  try { const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const trip = await createTrip(createTripRepository(supabase), user.id, parsed.data); return NextResponse.json({ trip }, { status: 201 }); } catch (error) { return fail(error, "We couldn’t create that trip. Nothing was lost — try again."); }
}
