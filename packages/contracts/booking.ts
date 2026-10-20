
export type Booking = {
  id: string;
  kind: "flight" | "stay";
  provider: "duffel" | "liteapi";
  status: "pending" | "confirmed" | "failed" | "cancelled";
  providerReference: string | null;
  confirmationCode: string | null;
  currency: string | null;
  totalAmount: number | null;
  createdAt: string;
};

type BookingRow = { id: string; kind: string; provider: string; status: string; provider_reference: string | null; confirmation_code: string | null; currency: string | null; total_amount: number | string | null; created_at: string };

/** DB row (snake_case) → API shape (camelCase). Shared by the booking routes. */
export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    kind: row.kind as Booking["kind"],
    provider: row.provider as Booking["provider"],
    status: row.status as Booking["status"],
    providerReference: row.provider_reference,
    confirmationCode: row.confirmation_code,
    currency: row.currency,
    totalAmount: row.total_amount == null ? null : Number(row.total_amount),
    createdAt: row.created_at,
  };
}
