import { beforeEach, describe, expect, it, vi } from "vitest";

const builder = vi.fn();
vi.mock("@/lib/application/bulk-builder", () => ({ runBulkBuilder: (...a: unknown[]) => builder(...a) }));

import { plainStayAbout, writeStayAbout } from "@/lib/application/stay-about";

const hotel = {
  name: "Canopy by Hilton", stars: 4, rating: 9.2, reviewCount: 2036, city: "Zagreb, Croatia", address: null,
  facilities: ["Wi-Fi", "Bar"], description: "Provides flawless service.Remain linked during your visit.", kind: "hotel",
  nearby: [{ name: "Museum of Broken Relationships", category: null, thumbnail: null, rating: null, reviewCount: null, description: null, ways: [{ mode: "walk" as const, minutes: 6 }] }],
};

describe("stay about", () => {
  beforeEach(() => builder.mockReset());

  it("uses the written blurb when it reads like a person wrote it", async () => {
    const text = "A four-star hotel in central Zagreb, rated 9.2 out of 10 by guests. The Museum of Broken Relationships is a six-minute walk away.";
    builder.mockResolvedValue({ about: text });
    expect(await writeStayAbout({ hotel })).toBe(text);
  });
  it("falls back to the plain facts when the blurb is run-together marketing copy, or the model is down", async () => {
    const plain = "A 4-star hotel in Zagreb, rated 9.2 out of 10 by 2,036 guests, 6 minutes on foot from Museum of Broken Relationships.";
    builder.mockResolvedValue({ about: "Offers flawless service.Remain linked https://x.test" });
    expect(await writeStayAbout({ hotel })).toBe(plain);
    builder.mockResolvedValue(null);
    expect(await writeStayAbout({ hotel })).toBe(plain);
  });
  it("never shows the listing's own text, and reads an apartment as one", () => {
    expect(plainStayAbout({ ...hotel, kind: "vacation rental", stars: null, rating: null, nearby: [] })).toBe("A vacation rental in Zagreb.");
  });
});
