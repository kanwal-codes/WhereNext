import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/with-route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/server/limits";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { parseTripPrompt } from "@/lib/application/parse-trip";

/** Turn a one-line trip description into "new trip" form fields. The client fills the form; nothing is created here. */
export async function POST(request: Request) {
  const parsed = z.object({ prompt: z.string().trim().min(1).max(600) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say a little about the trip." }, { status: 400 });
  try {
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!(await withinRateLimit(`user-llm:${user.id}`, LIMITS.llm.max, 60 * 60_000))) return NextResponse.json({ error: "You’ve used a lot of searches this hour. Try again in a little while." }, { status: 429 });
    return NextResponse.json({ parsed: await parseTripPrompt(parsed.data.prompt, request.signal) });
  } catch (error) {
    return fail(error, "We couldn’t read that — fill in the form instead.");
  }
}
