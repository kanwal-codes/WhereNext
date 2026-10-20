import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { placePhotoResponse } from "@/lib/server/place-photo";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { LIMITS } from "@/lib/server/limits";

/** A Google place photo for the account page (no trip involved): any signed-in user. */
export const GET = withRoute(async (request: Request) => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    // Every call is a billed Places Photo fetch with no server-side cache; bound it per person.
    if (!(await withinRateLimit(`user-${LIMITS.photo.bucket}:${user.id}`, LIMITS.photo.max, 60 * 60_000))) {
      return NextResponse.json({ error: "Too many photo requests. Try again in a while." }, { status: 429 });
    }
    return await placePhotoResponse(new URL(request.url).searchParams);
  } catch (error) {
    return fail(error, "Place photo is unavailable");
  }
});
