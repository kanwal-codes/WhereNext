import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import type { StayDetails, StayOption, StayRoom, StaySearchResult } from "../../contracts/stay";

export type { StayDetails, StayOption, StayRoom, StaySearchResult };

// LiteAPI (Nuitée) — live hotel inventory + nightly rates. Sandbox key is `sand_…`,
// production `prod_…`. The user's key currently lives in CONNECT_API_KEY.
const API = "https://api.liteapi.travel/v3.0";
const key = () => process.env.LITEAPI_KEY || process.env.CONNECT_API_KEY || "";
const HEADERS = () => ({ "X-API-Key": key(), "content-type": "application/json", accept: "application/json" });

export const liteApiConfigured = () => Boolean(key());

const hotelsSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    name: z.string().default("Hotel"),
    address: z.string().nullish(),
    city: z.string().nullish(),
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
    stars: z.number().nullish(),
    rating: z.number().nullish(),
    reviewCount: z.number().nullish(),
    thumbnail: z.string().nullish(),
  })).default([]),
});

const priceSchema = z.array(z.object({ amount: z.number(), currency: z.string() })).default([]);
const ratesSchema = z.object({
  data: z.array(z.object({
    hotelId: z.string(),
    roomTypes: z.array(z.object({
      offerId: z.string().nullish(),
      offerRetailRate: z.object({ amount: z.number(), currency: z.string() }).nullish(),
      rates: z.array(z.object({
        rateId: z.string().nullish(),
        name: z.string().default("Room"),
        boardName: z.string().nullish(),
        maxOccupancy: z.number().nullish(),
        retailRate: z.object({ total: priceSchema, taxesAndFees: priceSchema.nullish() }).nullish(),
        cancellationPolicies: z.object({
          refundableTag: z.string().nullish(),
          cancelPolicyInfos: z.array(z.object({ cancelTime: z.string().nullish() })).nullish(),
        }).nullish(),
      })).default([]),
    })).default([]),
  })).default([]),
});
type RoomTypes = z.infer<typeof ratesSchema>["data"][number]["roomTypes"];

const imageSchema = z.object({ url: z.string().nullish(), urlHd: z.string().nullish(), order: z.number().nullish(), defaultImage: z.boolean().nullish() });
const hotelDetailsSchema = z.object({
  data: z.object({
    id: z.string().nullish(),
    name: z.string().nullish(),
    hotelDescription: z.string().nullish(),
    hotelImages: z.array(imageSchema).nullish(),
    main_photo: z.string().nullish(),
    thumbnail: z.string().nullish(),
    hotelFacilities: z.array(z.string()).nullish(),
    facilities: z.array(z.object({ name: z.string().nullish() })).nullish(),
    checkinCheckoutTimes: z.object({
      checkin: z.string().nullish(),
      checkinStart: z.string().nullish(),
      checkin_start: z.string().nullish(),
      checkinEnd: z.string().nullish(),
      checkin_end: z.string().nullish(),
      checkout: z.string().nullish(),
    }).nullish(),
    address: z.string().nullish(),
    city: z.string().nullish(),
    country: z.string().nullish(),
    location: z.object({ latitude: z.number().nullish(), longitude: z.number().nullish() }).nullish(),
    starRating: z.number().nullish(),
    rating: z.number().nullish(),
    reviewCount: z.number().nullish(),
    rooms: z.array(z.object({
      roomName: z.string().nullish(),
      description: z.string().nullish(),
      maxOccupancy: z.number().nullish(),
      photos: z.array(z.object({ url: z.string().nullish() })).nullish(),
    })).nullish(),
  }),
});

const nightsBetween = (checkin: string, checkout: string) =>
  Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000));

const stripTags = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: HEADERS(), body: JSON.stringify(body), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI ${path} failed: ${response.status}`);
  return response.json();
}

async function get(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(`${API}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { headers: HEADERS(), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI ${path} failed: ${response.status}`);
  return response.json();
}

/** Shared body for `/hotels/rates`. guestNationality is required by LiteAPI and affects eligibility. */
function rateBody(hotelIds: string[], input: { checkin: string; checkout: string; adults?: number; currency?: string }) {
  return {
    hotelIds,
    occupancies: [{ adults: Math.max(1, Math.min(input.adults ?? 2, 8)) }],
    currency: input.currency ?? "USD",
    guestNationality: process.env.LITEAPI_GUEST_NATIONALITY || "US",
    checkin: input.checkin,
    checkout: input.checkout,
  };
}

/** Every priced room for one hotel, cheapest first. Reads all rates of a room type, not just the first. */
function parseRooms(roomTypes: RoomTypes, nights: number): StayRoom[] {
  const rooms: StayRoom[] = [];
  for (const roomType of roomTypes) {
    const rates = roomType.rates.length ? roomType.rates : [null];
    for (const rate of rates) {
      const total = rate?.retailRate?.total[0]?.amount ?? roomType.offerRetailRate?.amount;
      const currency = rate?.retailRate?.total[0]?.currency ?? roomType.offerRetailRate?.currency;
      if (total == null || !currency) continue;
      const taxes = rate?.retailRate?.taxesAndFees?.[0]?.amount;
      rooms.push({
        offerId: roomType.offerId ?? undefined,
        rateId: rate?.rateId ?? undefined,
        name: rate?.name ?? "Room",
        boardName: rate?.boardName ?? null,
        refundable: (rate?.cancellationPolicies?.refundableTag ?? "").toUpperCase() === "RFN",
        cancelBefore: rate?.cancellationPolicies?.cancelPolicyInfos?.[0]?.cancelTime ?? null,
        maxOccupancy: rate?.maxOccupancy ?? null,
        nightlyAmount: Math.round(total / nights),
        totalAmount: Math.round(total),
        taxesAndFees: typeof taxes === "number" ? Math.round(taxes) : null,
        currency,
      });
    }
  }
  rooms.sort((a, b) => a.totalAmount - b.totalAmount);
  return rooms.slice(0, 12);
}

async function hotelIndex(
  input: { city?: string; countryCode?: string; latitude?: number; longitude?: number },
  limit: number,
  signal?: AbortSignal,
) {
  const params: Record<string, string> = { language: "en", limit: String(Math.min(Math.max(limit, 20), 40)) };
  if (input.latitude != null && input.longitude != null) {
    params.latitude = String(input.latitude);
    params.longitude = String(input.longitude);
    params.radius = "6000";
  } else {
    if (input.countryCode) params.countryCode = input.countryCode;
    if (input.city) params.cityName = input.city;
  }
  return hotelsSchema.parse(await get("/data/hotels", params, signal)).data;
}

/** Cheapest bookable stay near a place, priced for the given nights. Keeps every room rate per hotel.
 *  `limit` caps how many priced options come back — 6 for a chat card, more for the Stay tab. */
export async function searchStays(
  input: { city?: string; countryCode?: string; latitude?: number; longitude?: number; checkin: string; checkout: string; adults?: number; currency?: string; limit?: number },
  signal?: AbortSignal,
): Promise<StaySearchResult> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 30);
  const nights = nightsBetween(input.checkin, input.checkout);
  const hotels = await hotelIndex(input, limit + 6, signal);
  if (hotels.length === 0) return { nights, options: [] };

  const byId = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const raw = await post("/hotels/rates", rateBody(hotels.map((hotel) => hotel.id), input), signal);

  const options: StayOption[] = [];
  for (const priced of ratesSchema.parse(raw).data) {
    const hotel = byId.get(priced.hotelId);
    if (!hotel) continue;
    const rooms = parseRooms(priced.roomTypes, nights);
    const cheapest = rooms[0];
    if (!cheapest) continue;
    options.push({
      hotelId: priced.hotelId,
      name: hotel.name,
      address: hotel.address ?? null,
      city: hotel.city ?? null,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
      stars: hotel.stars ?? null,
      rating: hotel.rating ?? null,
      reviewCount: hotel.reviewCount ?? null,
      thumbnail: hotel.thumbnail ?? null,
      nightlyAmount: cheapest.nightlyAmount,
      totalAmount: cheapest.totalAmount,
      currency: cheapest.currency,
      boardName: cheapest.boardName,
      refundable: cheapest.refundable,
      rooms,
    });
  }
  options.sort((a, b) => a.nightlyAmount - b.nightlyAmount);
  return { nights, options: options.slice(0, limit) };
}

/** Fresh room rates for one hotel and date range. */
export async function stayRooms(
  input: { hotelId: string; checkin: string; checkout: string; adults?: number; currency?: string },
  signal?: AbortSignal,
): Promise<{ nights: number; rooms: StayRoom[] }> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const nights = nightsBetween(input.checkin, input.checkout);
  const raw = await post("/hotels/rates", rateBody([input.hotelId], input), signal);
  const priced = ratesSchema.parse(raw).data[0];
  return { nights, rooms: priced ? parseRooms(priced.roomTypes, nights) : [] };
}

/** Static hotel content: description, gallery, facilities, check-in times. */
export async function hotelDetails(hotelId: string, signal?: AbortSignal): Promise<StayDetails> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const raw = await get("/data/hotel", { hotelId, language: "en" }, signal);
  if (process.env.AI_DEBUG) console.log("[liteapi] /data/hotel keys:", Object.keys((raw as { data?: object }).data ?? {}));
  const d = hotelDetailsSchema.parse(raw).data;
  const gallery = (d.hotelImages ?? [])
    .map((image) => ({ url: image.urlHd || image.url || "", order: image.order ?? Number.MAX_SAFE_INTEGER, first: image.defaultImage === true }))
    .filter((image) => image.url.startsWith("http"))
    .sort((a, b) => Number(b.first) - Number(a.first) || a.order - b.order)
    .map((image) => image.url);
  const images = Array.from(new Set(gallery.length ? gallery : [d.main_photo, d.thumbnail].filter((url): url is string => Boolean(url && url.startsWith("http"))))).slice(0, 12);
  const facilities = Array.from(new Set([
    ...(d.hotelFacilities ?? []),
    ...(d.facilities ?? []).map((f) => f.name ?? "").filter(Boolean),
  ].map((f) => f.trim()).filter(Boolean)));
  const times = d.checkinCheckoutTimes;
  return {
    hotelId: d.id ?? hotelId,
    name: d.name ?? "Hotel",
    description: d.hotelDescription ? stripTags(d.hotelDescription) || null : null,
    images,
    facilities,
    checkinFrom: times?.checkinStart ?? times?.checkin_start ?? times?.checkin ?? null,
    checkinTo: times?.checkinEnd ?? times?.checkin_end ?? null,
    checkout: times?.checkout ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    country: d.country ?? null,
    latitude: d.location?.latitude ?? null,
    longitude: d.location?.longitude ?? null,
    stars: d.starRating ?? null,
    rating: d.rating ?? null,
    reviewCount: d.reviewCount ?? null,
    roomCatalogue: (d.rooms ?? [])
      .filter((room) => room.roomName)
      .slice(0, 12)
      .map((room) => ({
        name: room.roomName as string,
        maxOccupancy: room.maxOccupancy ?? null,
        photo: room.photos?.find((p) => p.url?.startsWith("http"))?.url ?? null,
        description: room.description ? stripTags(room.description) || null : null,
      })),
  };
}
