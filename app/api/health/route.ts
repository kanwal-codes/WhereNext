import { NextResponse } from "next/server";
import { withRoute } from "@/lib/server/with-route";

export const runtime = "nodejs";

/** Liveness: the process is up and serving. No auth, no I/O. */
export const GET = withRoute(async () => NextResponse.json({ ok: true, ts: Date.now() }));
