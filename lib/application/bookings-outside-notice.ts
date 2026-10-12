import { notifyToast } from "@/lib/application/toast";

/** After the trip's dates change: bookings keep their real dates, so say when some no longer fit the new ones. */
export function noticeBookingsOutside(body: unknown): void {
  const n = (body as { bookingsOutsideDates?: unknown } | null)?.bookingsOutsideDates;
  if (typeof n === "number" && n > 0) {
    notifyToast(`${n} ${n === 1 ? "booking is" : "bookings are"} now outside the trip dates. They keep their own dates; check the Bookings page.`, "error");
  }
}
