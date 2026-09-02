import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTripPrompt } from "@/lib/application/parse-trip";

/** Turn a one-line trip description into "new trip" form fields. The client fills the form; nothing is created here. */
export async function POST(request: Request) {
  const parsed = z.object({ prompt: z.string().trim().min(1).max(600) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say a little about the trip." }, { status: 400 });
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    return NextResponse.json({ parsed: await parseTripPrompt(parsed.data.prompt, request.signal) });
  } catch (error) {
    console.error("trip_parse_failed", error);
    return NextResponse.json({ error: "Could not read that — fill the form in instead." }, { status: 503 });
  }
}
