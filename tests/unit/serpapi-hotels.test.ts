import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardedFetchMock } = vi.hoisted(() => ({ guardedFetchMock: vi.fn() }));
vi.mock("../../lib/server/provider-guard", () => ({ guardedFetch: guardedFetchMock }));

import { googleHotelDetails, isGoogleStayId, searchGoogleHotels } from "../../packages/providers/serpapi/hotels";

const reply = (body: unknown, ok = true) => guardedFetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
const prop = (over: Record<string, unknown> = {}) => ({
  name: "Hotel Blue", type: "hotel", property_token: "tok1", extracted_hotel_class: 4, overall_rating: 4.5, reviews: 120,
  rate_per_night: { extracted_lowest: 93 }, total_rate: { extracted_lowest: 279 }, gps_coordinates: { latitude: 45.8, longitude: 15.9 },
  images: [{ thumbnail: "https://img/1.jpg" }], ...over,
});
const input = { location: "Zagreb", checkin: "2026-11-15", checkout: "2026-11-18", currency: "CAD" };

beforeEach(() => {
  guardedFetchMock.mockReset();
  process.env.SERP_API_KEY = "test-key";
});

describe("searchGoogleHotels", () => {
  it("maps hotels to priced options: our ids, ratings out of ten, the page's facets", async () => {
    reply({ properties: [prop(), prop({ name: "Zagreb Studio", type: "vacation rental", property_token: "tok2", extracted_hotel_class: undefined, overall_rating: 4.9, rate_per_night: { extracted_lowest: 60 }, total_rate: undefined }), prop({ name: "No price", property_token: "tok3", rate_per_night: undefined }), prop()] });
    const { options, facets, nights } = await searchGoogleHotels(input);
    expect(nights).toBe(3);
    expect(options.map((o) => o.hotelId)).toEqual(["g:tok2", "g:tok1"]); // cheapest first; the unpriced one and the repeat are dropped
    expect(options[1]).toMatchObject({ name: "Hotel Blue", stars: 4, rating: 9, reviewCount: 120, nightlyAmount: 93, totalAmount: 279, currency: "CAD", propertyType: "Hotel", latitude: 45.8, thumbnail: "https://img/1.jpg", rooms: [] });
    expect(options[0]).toMatchObject({ rating: 9.8, totalAmount: 180, propertyType: "Vacation Rental" }); // no total listed: nightly times nights
    expect(facets).toEqual({ priceMin: 60, priceMax: 93, stars: [4], boards: [], propertyTypes: ["Hotel", "Vacation Rental"] });
    expect(isGoogleStayId(options[0].hotelId)).toBe(true);
  });
  it("filters and sorts the page it got, after taking its facets", async () => {
    reply({ properties: [prop(), prop({ name: "Cheap", property_token: "t2", extracted_hotel_class: 3, rate_per_night: { extracted_lowest: 50 }, overall_rating: 3.9 })] });
    const out = await searchGoogleHotels({ ...input, starRatings: [4], sort: "rating" });
    expect(out.options.map((o) => o.name)).toEqual(["Hotel Blue"]);
    expect(out.facets.priceMin).toBe(50);
  });
  it("asks for hotels in the place, for the guests and the currency, and never leaks the key", async () => {
    reply({});
    await searchGoogleHotels({ ...input, adults: 3 });
    const url = String(guardedFetchMock.mock.calls[0][1]);
    expect(url).toContain("engine=google_hotels");
    expect(url).toContain("q=Hotels+in+Zagreb");
    expect(url).toContain("adults=3");
    expect(url).toContain("currency=CAD");
    reply({ error: "Invalid API key: test-key" }, false);
    await expect(searchGoogleHotels(input)).rejects.toThrow(/^SerpAPI request failed: 500$/);
  });
});

describe("googleHotelDetails", () => {
  const detail = {
    name: "Canopy by Hilton", address: "Ul. kneza Branimira 29, 10000, Zagreb, Croatia", phone: "+385 1 4559 505", link: "https://hilton.com/x", overall_rating: 4.6, reviews: 2240, extracted_hotel_class: 4,
    description: "A refined hotel.", check_in_time: "3:00 PM", check_out_time: "12:00 PM", amenities: ["Wi-Fi", "Bar"], gps_coordinates: { latitude: 45.8, longitude: 15.97 },
    typical_price_range: { extracted_lowest: 138, extracted_highest: 182 },
    featured_prices: [{ source: "Booking.com", link: "https://b/", logo: "https://l/b.png", rate_per_night: { extracted_lowest: 110, extracted_before_taxes_fees: 97 }, total_rate: { extracted_lowest: 329, extracted_before_taxes_fees: 291 }, free_cancellation: true, free_cancellation_until_date: "Nov 8" }],
    prices: [{ source: "Canopy by Hilton", link: "https://h/", rate_per_night: { extracted_lowest: 125 } }, { source: "Booking.com", link: "https://b2/", rate_per_night: { extracted_lowest: 999 } }, { source: "No link", rate_per_night: { extracted_lowest: 1 } }],
    reviews_breakdown: [{ name: "Location", positive: 13, negative: 0, neutral: 1, total_mentioned: 14 }, { name: "Empty", total_mentioned: 0 }],
    ratings: [{ stars: 4, count: 367 }, { stars: 5, count: 1669 }],
    other_reviews: [{ source: "Trip.com", user_review: { username: "Member", date: "5 months ago", rating: { score: 4.2 }, comment: "Close to the tram." } }, { source: "x", user_review: {} }],
    nearby_places: [{ name: "Museum", category: "Point of interest", rating: 4.3, reviews: 90, transportations: [{ type: "Public transport", duration: "1 hr 5 min" }, { type: "Walking", duration: "5 min" }] }, { name: "Park" }],
  };
  const get = () => googleHotelDetails({ hotelId: "g:tok1", location: "Zagreb", checkin: "2026-11-15", checkout: "2026-11-18", adults: 2, currency: "CAD" });

  it("lists who sells it, cheapest first, once per site, with cancellation and the hotel's own site marked", async () => {
    reply(detail);
    const { sources } = await get();
    expect(sources.map((s) => s.source)).toEqual(["Booking.com", "Canopy by Hilton"]); // 110 before 125, and the second Booking.com row is the same site again
    expect(sources[0]).toMatchObject({ nightly: 110, total: 329, nightlyBeforeTaxes: 97, totalBeforeTaxes: 291, freeCancellation: true, cancelUntil: "Nov 8", official: false, logo: "https://l/b.png" });
    expect(sources[1]).toMatchObject({ official: true, total: 375 }); // the hotel's own site, total from nightly times nights
  });
  it("reads the price against what the hotel usually costs", async () => {
    reply(detail);
    expect((await get()).priceRead).toEqual({ level: "low", typicalLow: 138, typicalHigh: 182, currency: "CAD" });
    reply({ ...detail, typical_price_range: { extracted_lowest: 60, extracted_highest: 100 } });
    expect((await get()).priceRead?.level).toBe("high");
    reply({ ...detail, typical_price_range: undefined });
    expect((await get()).priceRead).toBeNull();
  });
  it("brings the content, themes, reviews and what is near", async () => {
    reply(detail);
    const d = await get();
    expect(d.hotel).toMatchObject({ hotelId: "g:tok1", name: "Canopy by Hilton", rating: 9.2, stars: 4, city: "Zagreb, Croatia", country: "Croatia", checkinFrom: "3:00 PM", facilities: ["Wi-Fi", "Bar"] });
    expect(d.themes).toEqual([{ name: "Location", positive: 13, negative: 0, neutral: 1, total: 14 }]);
    expect(d.ratingCounts).toEqual([{ stars: 5, count: 1669 }, { stars: 4, count: 367 }]);
    expect(d.reviews).toEqual([expect.objectContaining({ rating: 8.4, text: "Close to the tram.", date: null, name: "Member · Trip.com · 5 months ago" })]);
    expect(d.nearby).toEqual([
      { name: "Museum", category: "Point of interest", thumbnail: null, rating: 4.3, reviewCount: 90, description: null, ways: [{ mode: "walk", minutes: 5 }, { mode: "transit", minutes: 65 }] }, // walking first, "1 hr 5 min" as 65
      { name: "Park", category: null, thumbnail: null, rating: null, reviewCount: null, description: null, ways: [] },
    ]);
    expect(d.phone).toBe("+385 1 4559 505");
  });
  it("fails when Google does not know the property", async () => {
    reply({});
    await expect(get()).rejects.toThrow("hotel not found");
  });
});
