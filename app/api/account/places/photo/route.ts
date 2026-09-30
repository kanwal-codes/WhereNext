import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fail } from "@/lib/server/with-route";
import { placePhotoResponse } from "@/lib/server/place-photo";

/** A Google place photo for the account page (no trip involved): any signed-in user. */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    return await placePhotoResponse(new URL(request.url).searchParams);
  } catch (error) {
    return fail(error, "Place photo is unavailable");
  }
}
