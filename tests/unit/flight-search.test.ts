import { beforeEach, describe, expect, it, vi } from "vitest";

const { serpMock, duffelMock, suggestMock, configured } = vi.hoisted(() => ({ serpMock: vi.fn(), duffelMock: vi.fn(), suggestMock: vi.fn(), configured: vi.fn() }));
vi.mock("../../lib/server/ttl-cache", () => ({ cached: async (_k: string, _t: number, load: () => Promise<unknown>) => load(), invalidate: async () => {} }));
vi.mock("../../lib/server/fx", () => ({ offersInCurrency: async (offers: unknown[]) => offers }));
vi.mock("../../packages/providers/duffel/client", () => ({ searchFlights: duffelMock }));
vi.mock("../../packages/providers/serpapi/client", () => ({ searchGoogleFlights: serpMock, suggestFlightPlaces: suggestMock, serpConfigured: configured }));

import { resolveEnd, searchFlightOffers } from "../../lib/server/flight-search";

const base = { origin: "Toronto", destination: "Zagreb", departureDate: "2026-11-15", currency: "CAD" };
beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  suggestMock.mockResolvedValue([{ id: "/m/toronto", label: "Toronto, Ontario, Canada", detail: "", kind: "city", airports: ["YYZ"] }, { id: "/m/ohio", label: "Toronto, Ohio", detail: "", kind: "city", airports: [] }]);
  serpMock.mockResolvedValue({ offers: [{ id: "a" }], insights: { level: "low", lowest: 1, typicalLow: null, typicalHigh: null } });
});

describe("resolveEnd", () => {
  it("uses a known id, a bare airport code, or the best suggestion for the text", async () => {
    expect(await resolveEnd("Anywhere", "/m/known")).toEqual({ id: "/m/known", label: "Anywhere" });
    expect(await resolveEnd("yyz")).toEqual({ id: "YYZ", label: "YYZ" });
    expect(suggestMock).not.toHaveBeenCalled();
    expect(await resolveEnd("Toronto")).toEqual({ id: "/m/toronto", label: "Toronto, Ontario, Canada" });
    expect(await resolveEnd("Toronto, Ohio")).toEqual({ id: "/m/ohio", label: "Toronto, Ohio" });
    expect(await resolveEnd("x")).toBeNull();
  });
  it("retries a qualified name Google does not recognise as the bare city, preferring the qualifier it was given", async () => {
    const places = [{ id: "/m/london", label: "London, United Kingdom", detail: "", kind: "city", airports: ["LHR"] }, { id: "/m/london-ontario", label: "London, Ontario, Canada", detail: "", kind: "city", airports: [] }];
    suggestMock.mockImplementation(async (q: string) => (q === "London" ? places : []));
    expect(await resolveEnd("London, United Kingdom")).toEqual({ id: "/m/london", label: "London, United Kingdom" });
    expect(await resolveEnd("London, UK")).toEqual({ id: "/m/london", label: "London, United Kingdom" }); // "UK" is too short to match on: the first suggestion
    expect(await resolveEnd("London, Ontario, Canada")).toEqual({ id: "/m/london-ontario", label: "London, Ontario, Canada" });
    expect(await resolveEnd("Toronto, ON, Nowhere")).toBeNull();
  });
});

describe("searchFlightOffers", () => {
  it("searches Google Flights by the resolved places, in the trip's currency", async () => {
    const found = await searchFlightOffers({ ...base, returnDate: "2026-11-22" });
    expect(serpMock).toHaveBeenCalledWith(expect.objectContaining({ departureId: "/m/toronto", arrivalId: "/m/toronto", returnDate: "2026-11-22", currency: "CAD" }));
    expect(found).toMatchObject({ provider: "serpapi", offers: [{ id: "a" }], from: { label: "Toronto, Ontario, Canada" } });
    expect(duffelMock).not.toHaveBeenCalled();
  });
  it("searches from the traveller's country, since Google lists and prices flights by where the search comes from", async () => {
    await searchFlightOffers({ ...base, country: "CA" });
    expect(serpMock).toHaveBeenCalledWith(expect.objectContaining({ country: "CA" }));
  });
  it("answers with nothing, and says which end it could not find, rather than guess", async () => {
    suggestMock.mockResolvedValue([]);
    const found = await searchFlightOffers(base);
    expect(found).toMatchObject({ offers: [], from: null });
    expect(serpMock).not.toHaveBeenCalled();
  });
  it("uses Duffel when asked to (the booking page) or when there is no SerpAPI key", async () => {
    duffelMock.mockResolvedValue([{ id: "d" }]);
    expect((await searchFlightOffers({ ...base, provider: "duffel" })).provider).toBe("duffel");
    configured.mockReturnValue(false);
    expect((await searchFlightOffers(base)).provider).toBe("duffel");
    expect(serpMock).not.toHaveBeenCalled();
  });
});
