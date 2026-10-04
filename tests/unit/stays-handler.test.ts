import { beforeEach, describe, expect, it, vi } from "vitest";

const { googleMock, liteMock, providerMock } = vi.hoisted(() => ({ googleMock: vi.fn(), liteMock: vi.fn(), providerMock: vi.fn() }));
vi.mock("../../lib/server/ttl-cache", () => ({ cached: async (_k: string, _t: number, load: () => Promise<unknown>) => load() }));
vi.mock("../../lib/server/stay-provider", () => ({ stayProvider: providerMock }));
vi.mock("../../packages/providers/serpapi/hotels", () => ({ searchGoogleHotels: googleMock }));
vi.mock("../../packages/providers/liteapi/client", () => ({ searchStays: liteMock }));

import { handleStays } from "../../lib/application/retrieve/handlers/stays";

const option = { hotelId: "g:tok", name: "Hotel Blue", address: null, city: null, latitude: 1, longitude: 2, stars: 4, rating: 9, reviewCount: 10, thumbnail: null, nightlyAmount: 93, totalAmount: 279, currency: "CAD", boardName: null, refundable: false, propertyType: "Hotel", rooms: [] };
const makeCtx = () => ({ filters: { currency: "CAD", travelers: 3 }, signal: undefined, fail: () => () => undefined, geocode: vi.fn().mockResolvedValue([15.9, 45.8]), stays: [] as unknown[] });
const call = { tool: "stays" as const, location: "Zagreb", checkin: "2099-11-15", checkout: "2099-11-18", hotelName: null };

beforeEach(() => vi.clearAllMocks());

describe("handleStays", () => {
  it("searches Google Hotels by the place name, for the party, in the trip's currency", async () => {
    providerMock.mockReturnValue("serpapi");
    googleMock.mockResolvedValue({ nights: 3, options: [option], facets: {} });
    const ctx = makeCtx();
    await handleStays(call, ctx as never);
    expect(googleMock).toHaveBeenCalledWith(expect.objectContaining({ location: "Zagreb", adults: 3, currency: "CAD", checkin: "2099-11-15" }), undefined);
    expect(liteMock).not.toHaveBeenCalled();
    expect(ctx.stays).toEqual([expect.objectContaining({ location: "Zagreb", nights: 3, adults: 3, provider: "serpapi", options: [option] })]);
  });
  it("uses LiteAPI when that is the only provider, and does nothing when there is none", async () => {
    providerMock.mockReturnValue("liteapi");
    liteMock.mockResolvedValue({ nights: 3, options: [{ ...option, hotelId: "lp1" }], facets: {} });
    const ctx = makeCtx();
    await handleStays(call, ctx as never);
    expect(googleMock).not.toHaveBeenCalled();
    expect(ctx.stays).toHaveLength(1);
    providerMock.mockReturnValue(null);
    const none = makeCtx();
    await handleStays(call, none as never);
    expect(none.stays).toEqual([]);
  });
});
