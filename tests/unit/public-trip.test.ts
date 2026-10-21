import { beforeEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
const SLUG = "abcdef0123456789";
let tripRow: { data: Any | null; error: unknown };
let itineraryRows: { data: Any[] | null };
let placesRows: { data: Any[] | null };
let decisionRows: { data: Any[] | null };
const createAdmin = vi.hoisted(() => vi.fn());
const cachedSpy = vi.hoisted(() => vi.fn());
const tablesAsked: string[] = [];
const filters: Array<[string, string, unknown]> = [];

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: (...a: unknown[]) => createAdmin(...a) }));
vi.mock("@/lib/server/ttl-cache", () => ({ cached: (key: string, ttl: number, load: () => Promise<unknown>) => { cachedSpy(key, ttl); return load(); } }));

const builder = (table: string) => {
  const result = () => (table === "trips" ? tripRow : table === "trip_itinerary_items" ? itineraryRows : table === "trip_places" ? placesRows : decisionRows);
  const q: Any = {};
  for (const m of ["select", "order"]) q[m] = () => q;
  for (const m of ["eq", "in", "is"]) q[m] = (col: string, val: unknown) => { filters.push([table, col, val]); return q; };
  q.maybeSingle = async () => result();
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return q;
};

import { loadPublicTrip } from "../../lib/server/public-trip";

const trip = (over: Any = {}) => ({ id: "t1", name: "Lisbon", destination: "Lisbon, Portugal", duration_days: 4, start_date: "2026-10-20", end_date: "2026-10-24", share_visibility: "link", ...over });

beforeEach(() => {
  tripRow = { data: trip(), error: null };
  itineraryRows = { data: [] }; placesRows = { data: [] }; decisionRows = { data: [] };
  createAdmin.mockReset(); cachedSpy.mockReset(); tablesAsked.length = 0; filters.length = 0;
  createAdmin.mockImplementation(() => ({ from: (table: string) => { tablesAsked.push(table); return builder(table); } }));
});

describe("loadPublicTrip: who can look", () => {
  it.each(["", "short", "ABCDEF0123456789", "abcdef0123456789zz", "abc/../def0123456789", "g".repeat(16), "a".repeat(65)])("refuses a slug that cannot be one (%s), before the cache or the database", async (slug) => {
    expect(await loadPublicTrip(slug)).toBeNull();
    expect(cachedSpy).not.toHaveBeenCalled();
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it("accepts 8 to 64 lowercase hex characters", async () => {
    await loadPublicTrip("a".repeat(8));
    await loadPublicTrip("f".repeat(64));
    expect(cachedSpy).toHaveBeenCalledTimes(2);
  });

  it("looks the trip up by its share slug only", async () => {
    await loadPublicTrip(SLUG);
    expect(filters).toContainEqual(["trips", "share_slug", SLUG]);
  });

  it("finds nothing for a slug no trip has", async () => {
    tripRow = { data: null, error: null };
    expect(await loadPublicTrip(SLUG)).toBeNull();
    expect(tablesAsked).toEqual(["trips"]);
  });

  it.each(["private", "members", null, undefined, "LINK"])("shows nothing for a trip shared as %s, and asks for none of its contents", async (visibility) => {
    tripRow = { data: trip({ share_visibility: visibility }), error: null };
    expect(await loadPublicTrip(SLUG)).toBeNull();
    expect(tablesAsked).toEqual(["trips"]);
  });

  it("lets a lookup failure through rather than calling the trip private", async () => {
    tripRow = { data: null, error: new Error("db down") };
    await expect(loadPublicTrip(SLUG)).rejects.toThrow("db down");
  });

  it("only reads the shared trip's own, still-present rows", async () => {
    await loadPublicTrip(SLUG);
    expect(filters).toContainEqual(["trip_itinerary_items", "trip_id", "t1"]);
    expect(filters).toContainEqual(["trip_itinerary_items", "removed_at", null]);
    expect(filters).toContainEqual(["trip_places", "trip_id", "t1"]);
    expect(filters).toContainEqual(["trip_places", "status", "saved"]);
    expect(filters).toContainEqual(["trip_decisions", "trip_id", "t1"]);
    expect(filters.find((f) => f[0] === "trip_decisions" && f[1] === "kind")?.[2]).toEqual(["stay_area", "stay", "transport", "flight"]);
  });
});

describe("loadPublicTrip: what it shows", () => {
  it("is cached for a minute under the slug", async () => {
    await loadPublicTrip(SLUG);
    expect(cachedSpy).toHaveBeenCalledWith(`public-trip:${SLUG}`, 60_000);
  });

  it("carries the trip's name, destination and dates", async () => {
    expect(await loadPublicTrip(SLUG)).toMatchObject({ name: "Lisbon", destination: "Lisbon, Portugal", durationDays: 4, startDate: "2026-10-20", endDate: "2026-10-24", itinerary: [], places: [], stay: null });
  });

  it("turns missing dates and length into null", async () => {
    tripRow = { data: trip({ duration_days: undefined, start_date: undefined, end_date: null }), error: null };
    expect(await loadPublicTrip(SLUG)).toMatchObject({ durationDays: null, startDate: null, endDate: null });
  });

  it("lists the itinerary with a day, a title and a place only when it is a real one", async () => {
    itineraryRows = { data: [
      { title: "Alfama", day_index: 1, metadata: { latitude: 38.71, longitude: -9.13 } },
      { title: "No place", day_index: 2, metadata: null },
      { title: "Null island", day_index: 2, metadata: { latitude: 0, longitude: 0 } },
      { title: "Bad", day_index: 3, metadata: { latitude: "38.7", longitude: Number.NaN } },
      { title: 42, day_index: "x", metadata: {} },
    ] };
    const result = await loadPublicTrip(SLUG);
    expect(result?.itinerary).toEqual([
      { dayIndex: 1, title: "Alfama", latitude: 38.71, longitude: -9.13 },
      { dayIndex: 2, title: "No place", latitude: null, longitude: null },
      { dayIndex: 2, title: "Null island", latitude: null, longitude: null },
      { dayIndex: 3, title: "Bad", latitude: null, longitude: null },
      { dayIndex: 1, title: "42", latitude: null, longitude: null },
    ]);
  });

  it("lists the saved places, whether the join gives one place or a list", async () => {
    placesRows = { data: [
      { places: { name: "Pastéis de Belém", category: "bakery", address: "Rua de Belém", metadata: { latitude: 38.69, longitude: -9.2 } } },
      { places: [{ name: "Time Out Market", category: null, metadata: {} }] },
      { places: null },
      { places: [] },
      {},
    ] };
    const result = await loadPublicTrip(SLUG);
    expect(result?.places).toEqual([
      { name: "Pastéis de Belém", category: "bakery", address: "Rua de Belém", latitude: 38.69, longitude: -9.2 },
      { name: "Time Out Market", category: null, address: null, latitude: null, longitude: null },
    ]);
  });

  it("gives a nameless place an empty name rather than 'undefined'", async () => {
    placesRows = { data: [{ places: { category: "x" } }] };
    expect((await loadPublicTrip(SLUG))?.places[0].name).toBe("");
  });

  it("shows the locked stay and nothing from the loosely-typed decisions", async () => {
    decisionRows = { data: [
      { kind: "transport", value: { anything: true } },
      { kind: "stay", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel Avenida", roomName: "R", board: null, refundable: true, checkin: "2026-10-20", checkout: "2026-10-24", nights: 4, nightlyAmount: 100, totalAmount: 400, currency: "EUR", latitude: 38.7, longitude: -9.1, address: null, thumbnail: null } },
    ] };
    const result = await loadPublicTrip(SLUG);
    expect(result?.stay?.hotelName).toBe("Hotel Avenida");
    expect(Object.keys(result ?? {})).not.toContain("decisions");
  });

  it("has no stay when the decision is malformed", async () => {
    decisionRows = { data: [{ kind: "stay", value: { hotelName: 3 } }] };
    expect((await loadPublicTrip(SLUG))?.stay).toBeNull();
  });

  it("copes with a query that returns no rows object at all", async () => {
    itineraryRows = { data: null }; placesRows = { data: null }; decisionRows = { data: null };
    expect(await loadPublicTrip(SLUG)).toMatchObject({ itinerary: [], places: [], stay: null });
  });
});
