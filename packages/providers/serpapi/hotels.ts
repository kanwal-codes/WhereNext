import { withProviderTimeout } from "../request-signal";
import { guardedFetch } from "@/lib/server/provider-guard";
import { cityFrom } from "../../../lib/places-ui";
import type { StayDetails, StayFacets, StayNearbyPlace, StayOption, StayPriceRead, StayPriceSource, StayReview, StaySearchResult, StayTheme } from "../../contracts/stay";

/**
 * Hotels the way Google Hotels shows them, through SerpAPI: real properties, real prices from several sites, Google's
 * ratings and review themes. There is no booking here: each price carries the link to the site that sells it.
 *
 * A hotel's id in this app is `g:` plus Google's property token, so the stay routes can tell these from LiteAPI's.
 */
export const GOOGLE_STAY_PREFIX = "g:";
export const isGoogleStayId = (id: string) => id.startsWith(GOOGLE_STAY_PREFIX);

const API = "https://serpapi.com/search.json";
type Params = Record<string, string | number | undefined>;

async function serp<T>(params: Params, signal?: AbortSignal): Promise<T> {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  url.searchParams.set("api_key", process.env.SERP_API_KEY ?? "");
  const response = await guardedFetch("serpapi", url, { signal: withProviderTimeout(signal, 25_000) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (body.error && /hasn'?t returned any results|no results/i.test(body.error)) return {} as T;
  if (!response.ok || body.error) throw new Error(`SerpAPI request failed: ${response.status}`); // never echo the URL: it carries the key
  return body;
}

type Money = { extracted_lowest?: number; extracted_before_taxes_fees?: number };
type Gps = { latitude?: number; longitude?: number };
type Image = { thumbnail?: string; original_image?: string };
type RawProperty = {
  name?: string; type?: string; property_token?: string; description?: string; hotel_class?: string; extracted_hotel_class?: number;
  overall_rating?: number; reviews?: number; rate_per_night?: Money; total_rate?: Money; gps_coordinates?: Gps; images?: Image[]; free_cancellation?: boolean;
};
type RawPrice = { source?: string; logo?: string; link?: string; rate_per_night?: Money; total_rate?: Money; free_cancellation?: boolean; free_cancellation_until_date?: string; official?: boolean };

export const nightsBetween = (checkin: string, checkout: string) => Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / 864e5));
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Google rates out of 5; stays everywhere else in the app (LiteAPI, the cards, the panel) read out of 10. */
const outOfTen = (n: number) => round1(n * 2);

export type GoogleStayInput = {
  /** A place or area: "Zagreb", "Old Town, Dubrovnik". */
  location: string;
  checkin: string;
  checkout: string;
  adults?: number;
  currency: string;
  limit?: number;
  starRatings?: number[];
  refundableOnly?: boolean;
  priceMax?: number;
  propertyTypes?: string[];
  sort?: "price" | "rating" | "stars";
};

function toOption(p: RawProperty, input: GoogleStayInput, nights: number): StayOption | null {
  const nightly = p.rate_per_night?.extracted_lowest;
  const total = p.total_rate?.extracted_lowest;
  if (!p.name || !p.property_token || typeof nightly !== "number") return null;
  return {
    hotelId: `${GOOGLE_STAY_PREFIX}${p.property_token}`,
    name: p.name,
    address: null,
    city: null,
    latitude: p.gps_coordinates?.latitude ?? null,
    longitude: p.gps_coordinates?.longitude ?? null,
    stars: p.extracted_hotel_class ?? null,
    rating: typeof p.overall_rating === "number" ? outOfTen(p.overall_rating) : null,
    reviewCount: p.reviews ?? null,
    thumbnail: p.images?.[0]?.thumbnail ?? null,
    nightlyAmount: nightly,
    totalAmount: typeof total === "number" ? total : nightly * nights,
    currency: input.currency,
    boardName: null,
    refundable: Boolean(p.free_cancellation),
    propertyType: p.type ? titleCase(p.type) : null,
    rooms: [],
  };
}

/** Hotels for a place and dates, filtered and sorted. Google returns about twenty per page; facets come from the whole page so the controls stay steady. */
export async function searchGoogleHotels(input: GoogleStayInput, signal?: AbortSignal): Promise<StaySearchResult> {
  const nights = nightsBetween(input.checkin, input.checkout);
  const body = await serp<{ properties?: RawProperty[] }>({
    engine: "google_hotels",
    q: `Hotels in ${input.location}`,
    check_in_date: input.checkin,
    check_out_date: input.checkout,
    adults: Math.max(1, Math.min(input.adults ?? 2, 24)),
    currency: input.currency,
    hl: "en",
  }, signal);
  const seen = new Set<string>();
  let options = (body.properties ?? []).flatMap((p) => {
    const option = toOption(p, input, nights);
    if (!option || seen.has(option.hotelId)) return [];
    seen.add(option.hotelId);
    return [option];
  });
  const facets: StayFacets = {
    priceMin: options.length ? Math.min(...options.map((o) => o.nightlyAmount)) : 0,
    priceMax: options.length ? Math.max(...options.map((o) => o.nightlyAmount)) : 0,
    stars: Array.from(new Set(options.map((o) => o.stars).filter((s): s is number => typeof s === "number" && s > 0))).sort((a, b) => b - a),
    boards: [], // Google does not say what a rate includes
    propertyTypes: Array.from(new Set(options.map((o) => o.propertyType).filter((t): t is string => Boolean(t)))).sort((a, b) => (a === "Hotel" ? -1 : b === "Hotel" ? 1 : a.localeCompare(b))),
  };
  if (input.starRatings?.length) options = options.filter((o) => o.stars != null && input.starRatings!.includes(Math.round(o.stars)));
  if (input.refundableOnly) options = options.filter((o) => o.refundable);
  if (typeof input.priceMax === "number") options = options.filter((o) => o.nightlyAmount <= input.priceMax!);
  if (input.propertyTypes?.length) options = options.filter((o) => o.propertyType && input.propertyTypes!.includes(o.propertyType));
  const sort = input.sort ?? "price";
  options.sort((a, b) => (sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) : sort === "stars" ? (b.stars ?? 0) - (a.stars ?? 0) : a.nightlyAmount - b.nightlyAmount));
  return { nights, options: options.slice(0, input.limit ?? 6), facets };
}

type RawDetail = RawProperty & {
  address?: string; phone?: string; link?: string; check_in_time?: string; check_out_time?: string; amenities?: string[];
  featured_prices?: RawPrice[]; prices?: RawPrice[];
  typical_price_range?: { extracted_lowest?: number; extracted_highest?: number };
  ratings?: Array<{ stars?: number; count?: number }>;
  reviews_breakdown?: Array<{ name?: string; positive?: number; negative?: number; neutral?: number; total_mentioned?: number }>;
  other_reviews?: Array<{ source?: string; user_review?: { username?: string; date?: string; rating?: { score?: number }; comment?: string } }>;
  nearby_places?: Array<{ name?: string; category?: string; thumbnail?: string; rating?: number; reviews?: number; description?: string; transportations?: Array<{ type?: string; duration?: string }> }>;
};

/** "6 min" or "1 hr 5 min" as minutes. */
const minutesOf = (text?: string) => {
  const hours = Number(/(\d+)\s*h/i.exec(text ?? "")?.[1] ?? 0);
  const mins = Number(/(\d+)\s*m/i.exec(text ?? "")?.[1] ?? 0);
  return hours * 60 + mins;
};
const modeOf = (type?: string): StayNearbyPlace["ways"][number]["mode"] => (/walk/i.test(type ?? "") ? "walk" : /transit|transport|public|bus|train|tram|subway|metro/i.test(type ?? "") ? "transit" : /taxi|ride|car|drive/i.test(type ?? "") ? "taxi" : "other");

/** What Google lists as near the property, with every way it gives to get there (walking before the rest, quickest first). */
function nearbyPlaces(raw: RawDetail["nearby_places"]): StayNearbyPlace[] {
  const order = { walk: 0, transit: 1, taxi: 2, other: 3 };
  return (raw ?? []).flatMap((n) => {
    if (!n.name) return [];
    const ways = (n.transportations ?? []).flatMap((t) => (minutesOf(t.duration) > 0 ? [{ mode: modeOf(t.type), minutes: minutesOf(t.duration) }] : [])).sort((a, b) => order[a.mode] - order[b.mode] || a.minutes - b.minutes);
    return [{ name: n.name, category: n.category ?? null, thumbnail: n.thumbnail ?? null, rating: typeof n.rating === "number" ? n.rating : null, reviewCount: n.reviews ?? null, description: n.description ?? null, ways }];
  }).slice(0, 10);
}

export type GoogleStayDetail = {
  hotel: StayDetails;
  sources: StayPriceSource[];
  priceRead: StayPriceRead | null;
  themes: StayTheme[];
  ratingCounts: Array<{ stars: number; count: number }>;
  reviews: StayReview[];
  nearby: StayNearbyPlace[];
  /** Google's own type for it ("hotel", "vacation rental"). */
  kind: string | null;
  phone: string | null;
  website: string | null;
};

/** Everything Google Hotels says about one property for the dates: who sells it at what price, how guests rate it, what is near. */
export async function googleHotelDetails(input: { hotelId: string; location: string; checkin: string; checkout: string; adults?: number; currency: string }, signal?: AbortSignal): Promise<GoogleStayDetail> {
  const nights = nightsBetween(input.checkin, input.checkout);
  const d = await serp<RawDetail>({
    engine: "google_hotels",
    q: input.location,
    property_token: input.hotelId.slice(GOOGLE_STAY_PREFIX.length),
    check_in_date: input.checkin,
    check_out_date: input.checkout,
    adults: Math.max(1, Math.min(input.adults ?? 2, 24)),
    currency: input.currency,
    hl: "en",
  }, signal);
  if (!d.name) throw new Error("hotel not found");

  const hotelName = d.name.toLowerCase();
  const sources: StayPriceSource[] = [];
  for (const price of [...(d.featured_prices ?? []), ...(d.prices ?? [])]) {
    const nightly = price.rate_per_night?.extracted_lowest;
    if (!price.source || !price.link || typeof nightly !== "number" || sources.some((s) => s.source === price.source)) continue;
    const total = price.total_rate?.extracted_lowest;
    sources.push({
      source: price.source,
      logo: price.logo ?? null,
      link: price.link,
      nightly,
      total: typeof total === "number" ? total : nightly * nights,
      nightlyBeforeTaxes: price.rate_per_night?.extracted_before_taxes_fees ?? null,
      totalBeforeTaxes: price.total_rate?.extracted_before_taxes_fees ?? null,
      freeCancellation: Boolean(price.free_cancellation),
      cancelUntil: price.free_cancellation_until_date ?? null,
      official: Boolean(price.official) || price.source.toLowerCase() === hotelName,
    });
  }
  sources.sort((a, b) => a.nightly - b.nightly);

  const typical = d.typical_price_range;
  const low = sources[0]?.nightly;
  const priceRead: StayPriceRead | null = typical?.extracted_lowest && typical.extracted_highest && low !== undefined
    ? { level: low < typical.extracted_lowest ? "low" : low > typical.extracted_highest ? "high" : "typical", typicalLow: typical.extracted_lowest, typicalHigh: typical.extracted_highest, currency: input.currency }
    : null;

  const images = (d.images ?? []).map((i) => i.original_image ?? i.thumbnail).filter((u): u is string => Boolean(u));
  const [checkinFrom, checkout] = [d.check_in_time ?? null, d.check_out_time ?? null];
  const hotel: StayDetails = {
    hotelId: input.hotelId,
    name: d.name,
    description: d.description ?? null,
    images,
    facilities: d.amenities ?? [],
    checkinFrom,
    checkinTo: null,
    checkout,
    address: d.address ?? null,
    city: cityFrom(d.address) || null,
    country: d.address?.split(",").pop()?.trim() || null,
    latitude: d.gps_coordinates?.latitude ?? null,
    longitude: d.gps_coordinates?.longitude ?? null,
    stars: d.extracted_hotel_class ?? null,
    rating: typeof d.overall_rating === "number" ? outOfTen(d.overall_rating) : null,
    reviewCount: d.reviews ?? null,
    roomCatalogue: [],
  };
  return {
    hotel,
    sources,
    priceRead,
    themes: (d.reviews_breakdown ?? []).flatMap((t) => (t.name && t.total_mentioned ? [{ name: t.name, positive: t.positive ?? 0, negative: t.negative ?? 0, neutral: t.neutral ?? 0, total: t.total_mentioned }] : [])).slice(0, 8),
    ratingCounts: (d.ratings ?? []).flatMap((r) => (r.stars && r.count !== undefined ? [{ stars: r.stars, count: r.count }] : [])).sort((a, b) => b.stars - a.stars),
    reviews: (d.other_reviews ?? []).flatMap((r) => {
      const u = r.user_review;
      if (!u?.comment) return [];
      // Google words the date as "5 months ago"; the panel reads dates, so the wording goes beside the name instead.
      return [{ rating: u.rating?.score != null ? outOfTen(u.rating.score) : null, headline: null, positives: null, negatives: null, text: u.comment.slice(0, 1200), date: null, travellerType: null, country: null, name: [u.username, r.source, u.date].filter(Boolean).join(" · ").slice(0, 120) || null }];
    }).slice(0, 8),
    nearby: nearbyPlaces(d.nearby_places),
    kind: d.type ?? null,
    phone: d.phone ?? null,
    website: d.link ?? null,
  };
}
