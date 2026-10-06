import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/server/logger";

/**
 * Deleting a trip, an account or a guest session removes database rows through FK cascades, but
 * `storage.objects` has no FK to `public.trips` / `auth.users`, so uploaded files outlived the rows
 * that owned them (reservation attachments can carry names and passport numbers; avatars sit in a
 * public bucket). These helpers remove them explicitly. Best effort: a storage failure is logged
 * and never fails the deletion the user asked for.
 */

const RESERVATION_FILES = "reservation-files";
const AVATARS = "avatars";

/** Every object path under `prefix`, descending into folders (storage lists a folder as an entry with a null id). */
async function listObjectPaths(admin: SupabaseClient, bucket: string, prefix: string, depth: number): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const paths: string[] = [];
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null || entry.id === undefined) {
      if (depth > 0) paths.push(...(await listObjectPaths(admin, bucket, path, depth - 1)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

async function removePaths(admin: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) logger.warn({ err: error, bucket }, "storage cleanup: remove failed");
  }
}

/** Remove every reservation attachment stored for one trip (`{tripId}/{reservationId}/{file}`). */
export async function purgeTripFiles(admin: SupabaseClient, tripId: string): Promise<void> {
  try {
    await removePaths(admin, RESERVATION_FILES, await listObjectPaths(admin, RESERVATION_FILES, tripId, 2));
  } catch (err) {
    logger.warn({ err, tripId }, "storage cleanup: couldn't purge a trip's files");
  }
}

/** Remove the files of every trip a user owns, plus their avatar folder. Call BEFORE deleting the
 *  user: the trip ids come from rows that the user's deletion cascades away. */
export async function purgeUserFiles(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    const trips = await admin.from("trips").select("id").eq("owner_id", userId).limit(1000);
    for (const trip of trips.data ?? []) await purgeTripFiles(admin, trip.id as string);
    await removePaths(admin, AVATARS, await listObjectPaths(admin, AVATARS, userId, 0));
  } catch (err) {
    logger.warn({ err, userId }, "storage cleanup: couldn't purge a user's files");
  }
}
