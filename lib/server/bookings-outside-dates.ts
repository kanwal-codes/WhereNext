import type { SupabaseClient } from "@supabase/supabase-js";
import { outsideTripDates } from "@/lib/trip-reservations";

/**
 * How many hand-entered bookings fall before the trip starts or after it ends. Bookings are real dates (a flight
 * leaves when it leaves), so moving the trip never moves them: the response says how many no longer fit so the
 * traveller can fix the dates or the booking instead of finding out at the airport.
 */
export async function countBookingsOutside(supabase: SupabaseClient, tripId: string, startDate: string | null, endDate: string | null): Promise<number> {
  if (!startDate || !endDate) return 0;
  const rows = await supabase.from("trip_reservations").select("starts_on,status").eq("trip_id", tripId);
  if (rows.error) return 0;
  return outsideTripDates((rows.data ?? []).map((r) => ({ startsOn: r.starts_on as string | null, status: r.status as "confirmed" | "cancelled" })), startDate, endDate).length;
}
