import { NextResponse } from "next/server";
import { withRoute, fail } from "@/lib/server/with-route";
import { createSupabaseServerClient, getSessionUser } from "@/lib/supabase/server";

/** The public (`pk.`) Mapbox token for the in-browser map. Signed-in users only, kept out of the JS bundle. */
export const GET = withRoute(async () => {
  try {
    const user = await getSessionUser(await createSupabaseServerClient());
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token || !token.startsWith("pk.")) return NextResponse.json({ error: "Map is not configured" }, { status: 503 });
    return NextResponse.json({ token }, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (error) {
    return fail(error, "The map isn’t available right now.");
  }
});
