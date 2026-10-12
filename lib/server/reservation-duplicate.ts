import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReservationInput } from "@/packages/contracts/reservation";

/**
 * A reservation with the same booking reference, kind and start day as one already on the trip is the
 * same booking added twice (a second paste of the same email, two friends adding the same flight). Both
 * would otherwise be counted in the budget. Returns the existing one's title, or null when it is new.
 * `ignoreId` is the reservation being edited, so saving it unchanged is never a duplicate of itself.
 */
export async function findDuplicateReservation(supabase: SupabaseClient, tripId: string, input: ReservationInput, ignoreId?: string): Promise<string | null> {
  const code = input.confirmationCode?.trim();
  if (!code) return null;
  let query = supabase
    .from("trip_reservations")
    .select("id,title")
    .eq("trip_id", tripId)
    .eq("kind", input.kind)
    .ilike("confirmation_code", code.replace(/[\\%_]/g, (c) => `\\${c}`));
  query = input.startsOn ? query.eq("starts_on", input.startsOn) : query.is("starts_on", null);
  if (ignoreId) query = query.neq("id", ignoreId);
  const { data } = await query.limit(1);
  return (data as Array<{ title: string }> | null)?.[0]?.title ?? null;
}
