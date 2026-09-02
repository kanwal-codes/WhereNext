import { z } from "zod";

/** One bookable room rate at a hotel for a given date range. */
export const stayRoomSchema = z.object({
  offerId: z.string().max(200).optional(),
  rateId: z.string().max(200).optional(),
  name: z.string().max(120),
  boardName: z.string().max(60).nullable(),
  refundable: z.boolean(),
  /** ISO datetime the free-cancellation window closes; null when unknown or non-refundable. */
  cancelBefore: z.string().max(40).nullable(),
  maxOccupancy: z.number().int().positive().nullable(),
  nightlyAmount: z.number(),
  totalAmount: z.number(),
  taxesAndFees: z.number().nullable(),
  currency: z.string().max(8),
});
export type StayRoom = z.infer<typeof stayRoomSchema>;

/** A priced hotel from a stay search (LiteAPI). */
export type StayOption = {
  hotelId: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  thumbnail: string | null;
  nightlyAmount: number;
  totalAmount: number;
  currency: string;
  boardName: string | null;
  refundable: boolean;
  rooms: StayRoom[];
};

export type StaySearchResult = { nights: number; options: StayOption[] };

/** Static hotel content (description, gallery, facilities) — independent of dates. */
export type StayDetails = {
  hotelId: string;
  name: string;
  description: string | null;
  images: string[];
  facilities: string[];
  checkinFrom: string | null;
  checkinTo: string | null;
  checkout: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  roomCatalogue: Array<{ name: string; maxOccupancy: number | null; photo: string | null; description: string | null }>;
};

/** One hotel card inside an assistant `stays` block. Carries the id so the UI can open it in-app. */
export const stayItemSchema = z.object({
  hotelId: z.string().max(120),
  name: z.string().max(160),
  nightlyPrice: z.string().max(16),
  totalPrice: z.string().max(16),
  currency: z.string().max(8),
  stars: z.number().nonnegative().optional(),
  rating: z.number().nonnegative().optional(),
  reviews: z.number().int().nonnegative().optional(),
  board: z.string().max(60).optional(),
  refundable: z.boolean().optional(),
  distanceToLocked: z.string().max(120).optional(),
  thumbnailUrl: z.string().url().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
});
export type StayCardItem = z.infer<typeof stayItemSchema>;

/** The trip's locked stay — a `trip_decisions` row of kind "stay". */
export const stayDecisionSchema = z.object({
  provider: z.literal("liteapi"),
  hotelId: z.string().max(120),
  hotelName: z.string().max(160),
  roomName: z.string().max(120),
  rateId: z.string().max(200).optional(),
  board: z.string().max(60).nullable(),
  refundable: z.boolean(),
  checkin: z.string().max(10),
  checkout: z.string().max(10),
  nights: z.number().int().positive(),
  nightlyAmount: z.number(),
  totalAmount: z.number(),
  currency: z.string().max(8),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().max(200).nullable(),
  thumbnail: z.string().url().nullable(),
});
export type StayDecision = z.infer<typeof stayDecisionSchema>;

/** First `kind:"stay"` decision that parses. Decisions are ordered created_at desc, so this is the latest lock. */
export function readStayDecision(decisions: ReadonlyArray<{ kind: string; value: unknown }>): StayDecision | null {
  for (const decision of decisions) {
    if (decision.kind !== "stay") continue;
    const parsed = stayDecisionSchema.safeParse(decision.value);
    if (parsed.success) return parsed.data;
  }
  return null;
}
