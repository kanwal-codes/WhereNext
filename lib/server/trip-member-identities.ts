import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cached } from "@/lib/server/ttl-cache";
import { logger } from "@/lib/server/logger";

export type MemberIdentity = { email: string | null; name: string };

/**
 * userId -> {email, display name} for every member of a trip. Each entry needs its own remote
 * Auth Admin API call (no batch-by-id endpoint, and neither email nor name is mirrored onto a
 * local table) — this used to be fetched independently by the members-list route (for email)
 * and group-chat's @Roam route (for display name), each under its own cache key, so the same
 * N Auth Admin calls could run twice for the same trip within the same TTL window. Shared here
 * instead — one cache, one fan-out, both callers derive their own view from it.
 */
export async function tripMemberIdentities(tripId: string): Promise<Map<string, MemberIdentity>> {
  const entries = await cached(`member-identities:${tripId}`, 30_000, async (): Promise<Array<[string, MemberIdentity]>> => {
    const admin = createSupabaseAdminClient();
    const rows = await admin.from("trip_members").select("user_id").eq("trip_id", tripId);
    return Promise.all(
      ((rows.data ?? []) as Array<{ user_id: string }>).map(async ({ user_id }): Promise<[string, MemberIdentity]> => {
        // A failure here degrades to "Someone" / no email below — indistinguishable from a user
        // that genuinely has neither, so a real Auth Admin API outage would otherwise be invisible.
        const who = await admin.auth.admin.getUserById(user_id).then(
          (r) => r.data.user,
          (error: unknown) => { logger.warn({ err: error, userId: user_id }, "member identity lookup failed for one user"); return null; },
        );
        const meta = (who?.user_metadata ?? {}) as { name?: string; full_name?: string };
        const email = who?.email ?? null;
        return [user_id, { email, name: meta.name || meta.full_name || email?.split("@")[0] || "Someone" }];
      }),
    );
  });
  return new Map(entries);
}
