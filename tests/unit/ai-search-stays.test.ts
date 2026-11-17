import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateStructured } = vi.hoisted(() => ({ generateStructured: vi.fn() }));
vi.mock("@/packages/ai/model-policy", () => ({ generateStructured }));

import { parseAiSearch } from "../../lib/application/ai-search";

beforeEach(() => { generateStructured.mockReset(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-17T12:00:00Z")); });

describe("a hotel ask in the search bar", () => {
  it("applies the dates and the whole price range, whatever the model made of them", async () => {
    generateStructured.mockResolvedValue({ interpretation: "Hotels near the station up to 200", location: "near the station", priceMax: 200 });
    const d = await parseAiSearch("stays", "find me hotels near the station from 10 dec-14 dec between 100-200", {});
    expect(d).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", priceMin: 100, priceMax: 200, location: "near the station", interpretation: "Hotels near the station up to 200" });
  });
  it("asks no model at all when the sentence is only things the code reads", async () => {
    const d = await parseAiSearch("stays", "give me hotels from dec 10-dec20 price 150-200 and sort it from low to high", {});
    expect(generateStructured).not.toHaveBeenCalled();
    expect(d).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-20", priceMin: 150, priceMax: 200, sort: "price" });
  });
  it("keeps what the model read that the words do not fix", async () => {
    generateStructured.mockResolvedValue({ location: "near the old town", refundable: true });
    expect(await parseAiSearch("stays", "hotels near the old town, free cancellation", {})).toEqual({ location: "near the old town", refundable: true });
  });
  it("stops waiting for a slow model and applies what the words said", async () => {
    const gone = new AbortController(); gone.abort();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(gone.signal);
    generateStructured.mockImplementation((_m: unknown, _msgs: unknown, _schema: unknown, signal?: AbortSignal) => new Promise((_, reject) => { if (signal?.aborted) reject(new Error("aborted")); else signal?.addEventListener("abort", () => reject(new Error("aborted"))); }));
    const d = await parseAiSearch("stays", "give me hotels from dec 10-dec20 price 150-200 and sort it from low to high", {});
    expect(d).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-20", priceMin: 150, priceMax: 200, sort: "price" });
    vi.restoreAllMocks();
  });
  it("still applies the dates and prices when the model is unavailable", async () => {
    generateStructured.mockRejectedValue(new Error("no key"));
    expect(await parseAiSearch("stays", "hotels 10 dec to 14 dec between 100-200", {})).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", priceMin: 100, priceMax: 200 });
    // Part of the sentence needed the model: what was read is applied, and the rest is said to be unread.
    expect(await parseAiSearch("stays", "hotels near the old town dec 10 to 14", {})).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", unread: true });
    expect(await parseAiSearch("stays", "somewhere nice", {})).toEqual({ unread: true });
  });
});
