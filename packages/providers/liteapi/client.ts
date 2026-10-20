import { z } from "zod";
import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { stripTags } from "@/lib/server/html-text";
import { stayReviewSchema, type StayDetails, type StayFacets, type StayOption, type StayReview, type StayRoom, type StaySearchResult } from "../../contracts/stay";

export type { StayDetails, StayRoom, StaySearchResult, StayReview };

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
    hotelTypeId: z.number().nullish(),
  })).default([]),
});

// LiteAPI's `/data/hotelTypes` reference list — hardcoded since it's stable static data,
// not worth a live call on every search. Refresh from that endpoint if labels drift.
const HOTEL_TYPE_LABELS: Record<number, string> = {
  201: "Apartment", 203: "Hostel", 204: "Hotel", 205: "Motel", 206: "Resort", 207: "Residence",
  208: "Bed and breakfast", 209: "Ryokan", 210: "Farm stay", 212: "Holiday park", 213: "Villa",
  214: "Campsite", 215: "Boat", 216: "Guest house", 218: "Inn", 219: "Aparthotel", 220: "Holiday home",
  221: "Lodge", 222: "Homestay", 223: "Country house", 224: "Luxury tent", 225: "Capsule hotel",
  226: "Love hotel", 227: "Riad", 228: "Chalet", 229: "Condo", 230: "Cottage", 231: "Economy hotel",
  232: "Gite", 233: "Health resort", 234: "Cruise", 235: "Student accommodation", 243: "Tree house",
  247: "Pension", 250: "Vacation home", 251: "Pousada", 252: "Country house", 254: "Campsite",
  257: "Cabin", 258: "Holiday park", 262: "Affittacamere", 264: "Hostel", 265: "Houseboat",
  268: "Ranch", 271: "Agritourism property", 272: "Mobile home", 273: "Safari tent",
  274: "All-inclusive property", 276: "Castle", 277: "Property", 278: "Palace",
};
const propertyTypeLabel = (id?: number | null) => (id != null ? HOTEL_TYPE_LABELS[id] : undefined) ?? "Hotel";

/** "Home"-style categories LiteAPI's default relevance ranking buries far behind traditional
 * hotels — fetched with an explicit type filter so apartments/villas/etc. actually show up. */
const HOME_TYPE_IDS = [201, 207, 208, 213, 216, 219, 220, 221, 222, 223, 228, 229, 230, 232, 250, 252, 257, 265];

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


async function post(path: string, body: unknown, signal?: AbortSignal) {
  const response = await guardedFetch("liteapi", `${API}${path}`, { method: "POST", headers: HEADERS(), body: JSON.stringify(body), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI ${path} failed: ${response.status}`);
  return response.json();
}

async function get(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(`${API}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await guardedFetch("liteapi", url, { headers: HEADERS(), signal: withProviderTimeout(signal, 20_000) });
  if (!response.ok) throw new Error(`LiteAPI ${path} failed: ${response.status}`);
  return response.json();
}

/** Shared body for `/hotels/rates`. guestNationality is required by LiteAPI and affects eligibility. One occupancy object per room. */
function rateBody(hotelIds: string[], input: { checkin: string; checkout: string; adults?: number; rooms?: number; currency?: string }) {
  const rooms = Math.max(1, Math.min(input.rooms ?? 1, 8));
  const totalAdults = Math.max(rooms, Math.min(input.adults ?? 2, 24));
  const base = Math.floor(totalAdults / rooms);
  const extra = totalAdults - base * rooms;
  return {
    hotelIds,
    occupancies: Array.from({ length: rooms }, (_, i) => ({ adults: Math.max(1, base + (i < extra ? 1 : 0)) })),
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
  input: { city?: string; countryCode?: string; latitude?: number; longitude?: number; starRatings?: number[] },
  limit: number,
  signal?: AbortSignal,
) {
  const baseParams: Record<string, string> = { language: "en" };
  if (input.latitude != null && input.longitude != null) {
    baseParams.latitude = String(input.latitude);
    baseParams.longitude = String(input.longitude);
    baseParams.radius = "6000";
  } else {
    if (input.countryCode) baseParams.countryCode = input.countryCode;
    if (input.city) baseParams.cityName = input.city;
  }
  if (input.starRatings?.length) baseParams.starRating = input.starRatings.join(",");

  // LiteAPI's relevance ranking is hotel-heavy regardless of what's in scope, so a plain
  // call almost never surfaces apartments/villas within a normal result page — fetch a
  // guaranteed slice of them explicitly and merge, rather than leave it to chance.
  const [general, homes] = await Promise.all([
    hotelsSchema.parse(await get("/data/hotels", { ...baseParams, limit: String(Math.min(Math.max(limit, 20), 60)) }, signal)).data,
    hotelsSchema.parse(await get("/data/hotels", { ...baseParams, hotelTypeIds: HOME_TYPE_IDS.join(","), limit: String(Math.min(limit, 24)) }, signal).catch(() => ({ data: [] }))).data,
  ]);
  const byId = new Map(general.map((h) => [h.id, h]));
  for (const h of homes) if (!byId.has(h.id)) byId.set(h.id, h);
  return Array.from(byId.values());
}

const reviewsSchema = z.object({
  data: z.array(z.object({
    rating: z.number().nullish(),
    averageScore: z.number().nullish(),
    headline: z.string().nullish(),
    pros: z.string().nullish(),
    cons: z.string().nullish(),
    reviewText: z.string().nullish(),
    text: z.string().nullish(),
    date: z.string().nullish(),
    travelDate: z.string().nullish(),
    type: z.string().nullish(),
    travelerType: z.string().nullish(),
    country: z.string().nullish(),
    countryName: z.string().nullish(),
    name: z.string().nullish(),
    guestName: z.string().nullish(),
  })).nullish().default([]),
});

/** Guest reviews for one hotel (LiteAPI `/data/reviews`). */
export async function stayReviews(hotelId: string, limit = 12, signal?: AbortSignal): Promise<StayReview[]> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const raw = await get("/data/reviews", { hotelId, limit: String(limit), getSentiment: "false" }, signal).catch(() => ({ data: [] }));
  return (reviewsSchema.parse(raw).data ?? []).flatMap((r) => {
    const parsed = stayReviewSchema.safeParse({
      rating: r.rating ?? r.averageScore ?? null,
      headline: r.headline ?? null,
      positives: r.pros ? stripTags(r.pros) : null,
      negatives: r.cons ? stripTags(r.cons) : null,
      text: r.reviewText ?? r.text ? stripTags(String(r.reviewText ?? r.text)) : null,
      date: r.date ?? r.travelDate ?? null,
      travellerType: r.type ?? r.travelerType ?? null,
      country: r.countryName ?? r.country ?? null,
      name: r.guestName ?? r.name ?? null,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export type StaySearchInput = {
  city?: string; countryCode?: string; latitude?: number; longitude?: number;
  checkin: string; checkout: string;
  adults?: number; rooms?: number; currency?: string; limit?: number;
  starRatings?: number[]; boards?: string[]; refundableOnly?: boolean; priceMax?: number; propertyTypes?: string[];
  sort?: "price" | "rating" | "stars";
};

/** Bookable stays near a place, priced for the given nights, filtered and sorted. Keeps every room rate per hotel. */
export async function searchStays(input: StaySearchInput, signal?: AbortSignal): Promise<StaySearchResult> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 30);
  const nights = nightsBetween(input.checkin, input.checkout);
  // Cast a wider net when filters are on, since many will be dropped after pricing.
  const netWidth = limit + (input.starRatings?.length || input.boards?.length || input.refundableOnly || input.priceMax ? 24 : 6);
  const hotels = await hotelIndex({ ...input, starRatings: input.starRatings }, netWidth, signal);
  const empty: StayFacets = { priceMin: 0, priceMax: 0, stars: [], boards: [], propertyTypes: [] };
  if (hotels.length === 0) return { nights, options: [], facets: empty };

  const byId = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const raw = await post("/hotels/rates", rateBody(hotels.map((hotel) => hotel.id), input), signal);

  let options: StayOption[] = [];
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
      propertyType: propertyTypeLabel(hotel.hotelTypeId),
      rooms,
    });
  }

  // Facets from the full priced set (before applying the user's filters, so the controls stay stable).
  const facets: StayFacets = {
    priceMin: options.length ? Math.min(...options.map((o) => o.nightlyAmount)) : 0,
    priceMax: options.length ? Math.max(...options.map((o) => o.nightlyAmount)) : 0,
    stars: Array.from(new Set(options.map((o) => o.stars).filter((s): s is number => typeof s === "number" && s > 0))).sort((a, b) => b - a),
    boards: Array.from(new Set(options.flatMap((o) => o.rooms.map((r) => r.boardName)).filter((b): b is string => Boolean(b)))).sort(),
    propertyTypes: Array.from(new Set(options.map((o) => o.propertyType).filter((t): t is string => Boolean(t))))
      .sort((a, b) => (a === "Hotel" ? -1 : b === "Hotel" ? 1 : a.localeCompare(b))),
  };

  if (input.starRatings?.length) options = options.filter((o) => o.stars != null && input.starRatings!.includes(Math.round(o.stars)));
  if (input.boards?.length) options = options.filter((o) => o.rooms.some((r) => r.boardName && input.boards!.includes(r.boardName)));
  if (input.refundableOnly) options = options.filter((o) => o.rooms.some((r) => r.refundable));
  if (typeof input.priceMax === "number") options = options.filter((o) => o.nightlyAmount <= input.priceMax!);
  if (input.propertyTypes?.length) options = options.filter((o) => o.propertyType && input.propertyTypes!.includes(o.propertyType));

  const sort = input.sort ?? "price";
  options.sort((a, b) =>
    sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0)
    : sort === "stars" ? (b.stars ?? 0) - (a.stars ?? 0)
    : a.nightlyAmount - b.nightlyAmount,
  );
  return { nights, options: options.slice(0, limit), facets };
}

/** Fresh room rates for one hotel and date range. */
export async function stayRooms(
  input: { hotelId: string; checkin: string; checkout: string; adults?: number; rooms?: number; currency?: string },
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

/** Cancel a confirmed booking — `PUT /bookings/{bookingId}` (confirmed live against sandbox this session). */
export async function cancelBooking(bookingId: string, signal?: AbortSignal): Promise<{ status: string }> {
  if (!key()) throw new Error("LITEAPI_KEY is not configured");
  const response = await guardedFetch("liteapi", `${API}/bookings/${encodeURIComponent(bookingId)}`, {
    method: "PUT",
    headers: HEADERS(),
    body: JSON.stringify({}),
    signal: withProviderTimeout(signal, 20_000),
  });
  if (!response.ok) throw new Error(`LiteAPI cancel booking failed: ${response.status}`);
  const body = await response.json().catch(() => ({}));
  return { status: (body as { data?: { status?: string } }).data?.status ?? "cancelled" };
}
