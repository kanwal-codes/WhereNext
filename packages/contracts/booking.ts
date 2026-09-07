import { z } from "zod";

/** One Duffel passenger record — must match a passenger id from the searched offer. */
export const passengerSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.enum(["mr", "mrs", "ms", "miss", "dr"]),
  givenName: z.string().min(1).max(60),
  familyName: z.string().min(1).max(60),
  bornOn: z.string().max(10),
  gender: z.enum(["m", "f"]),
  email: z.string().email().max(160),
  phoneNumber: z.string().min(1).max(30),
});
export type Passenger = z.infer<typeof passengerSchema>;

/** One LiteAPI guest — occupancyNumber ties them to a specific room-occupancy slot. */
export const guestSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().max(160),
  occupancyNumber: z.number().int().positive(),
});
export type Guest = z.infer<typeof guestSchema>;

export const bookFlightInput = z.object({
  offerId: z.string().min(1).max(120),
  passengers: z.array(passengerSchema).min(1).max(9),
  idempotencyKey: z.string().min(1).max(120),
});
export type BookFlightInput = z.infer<typeof bookFlightInput>;

export const bookStayInput = z.object({
  offerId: z.string().min(1).max(4000),
  guests: z.array(guestSchema).min(1).max(8),
  // LiteAPI offerIds are opaque encoded blobs (1000+ chars) and the natural idempotency key is
  // derived from one (`stay:${offerId}`), so this needs far more headroom than the flight key.
  idempotencyKey: z.string().min(1).max(4100),
});
export type BookStayInput = z.infer<typeof bookStayInput>;

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

/** DB row (snake_case) → API shape (camelCase). Shared so both booking routes stay in sync. */
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
