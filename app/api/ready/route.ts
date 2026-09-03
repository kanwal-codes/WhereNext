import { NextResponse } from "next/server";
import Redis from "ioredis";
import { withRoute } from "@/lib/server/with-route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkServerEnv } from "@/lib/server/env-check";
import { cacheStats } from "@/lib/server/ttl-cache";

export const runtime = "nodejs";

const race = <T>(p: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);

async function pingDb(): Promise<"up" | "down"> {
  try {
    const query = createSupabaseAdminClient().from("_schema_migrations").select("filename").limit(1);
    const res = await race(Promise.resolve(query), 1_500);
    return res !== "timeout" && !(res as { error?: unknown }).error ? "up" : "down";
  } catch {
    return "down";
  }
}

async function pingRedis(): Promise<"up" | "down" | "not-configured"> {
  if (!process.env.REDIS_URL) return "not-configured";
  const client = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1_000 });
  try {
    await race(client.connect(), 1_000);
    const pong = await race(client.ping(), 500);
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  } finally {
    client.disconnect();
  }
}

/** Readiness: only 200 when the DB is reachable and required config is present. Never leaks values. */
export const GET = withRoute(async () => {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  const env = checkServerEnv();
  const ready = db === "up" && env.ok;
  return NextResponse.json(
    {
      ready,
      db,
      redis,
      env: { ok: env.ok, missingRequired: env.missingRequired, missingOptional: env.missingOptional },
      cache: cacheStats(),
    },
    { status: ready ? 200 : 503 },
  );
});
