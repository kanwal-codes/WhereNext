import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Postgres layer under `cached()` for responses worth keeping for days (opt in per call with `{ persistMs }`).
 * Best effort in both directions: with no service role, or on any database error, the caller just loads.
 * ponytail: `hits` is read-then-write (a rare lost count is fine); prune expired rows with a cron if the table grows.
 */
function db() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

export async function persisted<T>(key: string, persistMs: number, load: () => Promise<T>): Promise<T> {
  const client = db();
  if (client) {
    try {
      const { data } = await client.from("provider_cache").select("value,hits").eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (data) {
        void client.from("provider_cache").update({ hits: (data.hits ?? 0) + 1 }).eq("key", key).then(() => undefined, () => undefined);
        return data.value as T;
      }
    } catch {
      /* fall through to the provider */
    }
  }
  const value = await load();
  // Nothing found is not worth keeping for days: a later search may find something.
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  if (client && !empty) {
    const now = Date.now();
    void client
      .from("provider_cache")
      .upsert({ key, provider: key.split(":")[1] ?? key.split(":")[0], value: value as never, fetched_at: new Date(now).toISOString(), expires_at: new Date(now + persistMs).toISOString(), hits: 0 })
      .then(() => undefined, () => undefined);
  }
  return value;
}
