import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardedFetchMock } = vi.hoisted(() => ({ guardedFetchMock: vi.fn() }));
vi.mock("../../lib/server/ttl-cache", () => ({ cached: async (_k: string, _t: number, load: () => Promise<unknown>) => load() }));
vi.mock("../../lib/server/provider-guard", () => ({ guardedFetch: guardedFetchMock }));

import { fxRate, offersInCurrency } from "../../lib/server/fx";

const offer = (priceAmount: string, priceCurrency: string) => ({ id: "o", airline: "A", priceAmount, priceCurrency, durationMinutes: 60, stops: 0, departAt: "d", arriveAt: "a", passengerIds: [] });
const rates = (body: unknown, ok = true) => guardedFetchMock.mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

beforeEach(() => guardedFetchMock.mockReset());

describe("fxRate", () => {
  it("is 1 for the same currency without asking anyone", async () => {
    expect(await fxRate("CAD", "CAD")).toBe(1);
    expect(guardedFetchMock).not.toHaveBeenCalled();
  });
  it("reads the published rate, and is null when there is none", async () => {
    rates({ rates: { CAD: 1.424 } });
    expect(await fxRate("USD", "CAD")).toBe(1.424);
    rates({ rates: {} });
    expect(await fxRate("USD", "AED")).toBeNull();
    rates({}, false);
    expect(await fxRate("USD", "CAD")).toBeNull();
  });
});

describe("offersInCurrency", () => {
  it("converts to the trip's currency and keeps what the airline lists", async () => {
    rates({ rates: { CAD: 1.424 } });
    const [converted] = await offersInCurrency([offer("280.22", "USD")], "CAD");
    expect(converted).toMatchObject({ priceAmount: "399.03", priceCurrency: "CAD", listedAmount: "280.22", listedCurrency: "USD" });
  });
  it("leaves a fare alone when it is already in that currency, or no rate exists", async () => {
    expect((await offersInCurrency([offer("100.00", "CAD")], "CAD"))[0]).toMatchObject({ priceAmount: "100.00", priceCurrency: "CAD" });
    expect(guardedFetchMock).not.toHaveBeenCalled();
    rates({ rates: {} });
    const [kept] = await offersInCurrency([offer("50.00", "USD")], "AED");
    expect(kept).toMatchObject({ priceAmount: "50.00", priceCurrency: "USD" });
    expect(kept.listedCurrency).toBeUndefined();
  });
});
