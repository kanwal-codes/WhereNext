import { z } from "zod";
import { withProviderTimeout } from "../request-signal";

// LiteAPI (Nuitée) — live hotel inventory + nightly rates. Sandbox key is `sand_…`,
// production `prod_…`. The user's key currently lives in CONNECT_API_KEY.
const API = "https://api.liteapi.travel/v3.0";
const key = () => process.env.LITEAPI_KEY || process.env.CONNECT_API_KEY || "";
const HEADERS = () => ({ "X-API-Key": key(), "content-type": "application/json", accept: "application/json" });

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
};

export type StayRoom = {
  name: string;
  boardName: string | null;
  refundable: boolean;
  nightlyAmount: number;
  totalAmount: number;
  currency: string;
};

export type StaySearchResult = { nights: number; options: StayOption[] };

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
      offerRetailRate: z.object({ amount: z.number(), currency: z.string() }).nullish(),
      rates: z.array(z.object({
        name: z.string().default("Room"),
        boardName: z.string().nullish(),
        retailRate: z.object({ total: priceSchema }).nullish(),
        cancellationPolicies: z.object({ refundableTag: z.string().nullish() }).nullish(),
      })).default([]),
    })).default([]),
  })).default([]),
});

const nightsBetween = (checkin: string, checkout: string) =>
  Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000));

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`${API}${path}`, { method: "POST", headers: HEADERS(), body: JSON.stringify(body), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI ${path} failed: ${response.status}`);
  return response.json();
}

async function hotelIndex(
  input: { city?: string; countryCode?: string; latitude?: number; longitude?: number },
  signal?: AbortSignal,
) {
  const url = new URL(`${API}/data/hotels`);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "20");
  if (input.latitude != null && input.longitude != null) {
    url.searchParams.set("latitude", String(input.latitude));
    url.searchParams.set("longitude", String(input.longitude));
    url.searchParams.set("radius", "6000");
  } else {
    if (input.countryCode) url.searchParams.set("countryCode", input.countryCode);
    if (input.city) url.searchParams.set("cityName", input.city);
  }
  const response = await fetch(url, { headers: HEADERS(), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI hotel lookup failed: ${response.status}`);
  return hotelsSchema.parse(await response.json()).data;
}

/** Cheapest bookable stay near a place, priced for the given nights. */
export async function searchStays(
  input: { city?: string; countryCode?: string; latitude?: number; longitude?: number; checkin: string; checkout: string; adults?: number; currency?: string },
  signal?: AbortSignal,
): Promise<StaySearchResult> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const nights = nightsBetween(input.checkin, input.checkout);
  const hotels = await hotelIndex(input, signal);
  if (hotels.length === 0) return { nights, options: [] };

  const byId = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const raw = await post("/hotels/rates", {
    hotelIds: hotels.slice(0, 20).map((hotel) => hotel.id),
    occupancies: [{ adults: Math.max(1, Math.min(input.adults ?? 2, 8)) }],
    currency: input.currency ?? "USD",
    guestNationality: "US",
    checkin: input.checkin,
    checkout: input.checkout,
  }, signal);

  const options: StayOption[] = [];
  for (const priced of ratesSchema.parse(raw).data) {
    const hotel = byId.get(priced.hotelId);
    if (!hotel) continue;
    const cheapest = cheapestRoomType(priced.roomTypes);
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
      nightlyAmount: Math.round(cheapest.total / nights),
      totalAmount: Math.round(cheapest.total),
      currency: cheapest.currency,
      boardName: cheapest.boardName,
      refundable: cheapest.refundable,
    });
  }
  options.sort((a, b) => a.nightlyAmount - b.nightlyAmount);
  return { nights, options: options.slice(0, 6) };
}

/** Every room type for one hotel — the drill-down after a stays block. */
export async function stayRooms(
  input: { hotelId: string; checkin: string; checkout: string; adults?: number; currency?: string },
  signal?: AbortSignal,
): Promise<{ nights: number; rooms: StayRoom[] }> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const nights = nightsBetween(input.checkin, input.checkout);
  const raw = await post("/hotels/rates", {
    hotelIds: [input.hotelId],
    occupancies: [{ adults: Math.max(1, Math.min(input.adults ?? 2, 8)) }],
    currency: input.currency ?? "USD",
    guestNationality: "US",
    checkin: input.checkin,
    checkout: input.checkout,
  }, signal);
  const priced = ratesSchema.parse(raw).data[0];
  if (!priced) return { nights, rooms: [] };
  const rooms: StayRoom[] = [];
  for (const roomType of priced.roomTypes) {
    const rate = roomType.rates[0];
    const total = roomType.offerRetailRate?.amount ?? rate?.retailRate?.total[0]?.amount;
    const currency = roomType.offerRetailRate?.currency ?? rate?.retailRate?.total[0]?.currency;
    if (total == null || !currency) continue;
    rooms.push({
      name: rate?.name ?? "Room",
      boardName: rate?.boardName ?? null,
      refundable: (rate?.cancellationPolicies?.refundableTag ?? "").toUpperCase() === "RFN",
      nightlyAmount: Math.round(total / nights),
      totalAmount: Math.round(total),
      currency,
    });
  }
  rooms.sort((a, b) => a.nightlyAmount - b.nightlyAmount);
  return { nights, rooms: rooms.slice(0, 12) };
}

function cheapestRoomTypePrice(roomType: { offerRetailRate?: { amount: number; currency: string } | null; rates: Array<{ retailRate?: { total: Array<{ amount: number; currency: string }> } | null }> }) {
  const offer = roomType.offerRetailRate;
  if (offer) return { total: offer.amount, currency: offer.currency };
  const fromRate = roomType.rates[0]?.retailRate?.total[0];
  return fromRate ? { total: fromRate.amount, currency: fromRate.currency } : null;
}

function cheapestRoomType(roomTypes: z.infer<typeof ratesSchema>["data"][number]["roomTypes"]) {
  let best: { total: number; currency: string; boardName: string | null; refundable: boolean } | null = null;
  for (const roomType of roomTypes) {
    const price = cheapestRoomTypePrice(roomType);
    if (!price) continue;
    if (!best || price.total < best.total) {
      const rate = roomType.rates[0];
      best = {
        total: price.total,
        currency: price.currency,
        boardName: rate?.boardName ?? null,
        refundable: (rate?.cancellationPolicies?.refundableTag ?? "").toUpperCase() === "RFN",
      };
    }
  }
  return best;
}
