import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Place } from "../../packages/contracts/place";

// Regressions for the 2026-11-23 security audit (run-2).

describe("assistant link allow-list", () => {
  it("unwraps a link whose target hides its scheme behind a character reference", async () => {
    const { sanitizeAssistantContent } = await import("../../lib/application/sanitize-assistant");
    expect(sanitizeAssistantContent("[Rebook](https&#58;//attacker.example/x)", new Set())).toBe("Rebook");
    expect(sanitizeAssistantContent("see ![p](https&#x3A;//attacker.example/p.png)", new Set())).toBe("see ");
  });
  it("drops a reference definition to a host that is not allowed, keeps an allowed one", async () => {
    const { sanitizeAssistantContent } = await import("../../lib/application/sanitize-assistant");
    const out = sanitizeAssistantContent("[a][1] [b][2]\n\n[1]: https://attacker.example\n[2]: https://ok.example/", new Set(["https://ok.example/"]));
    expect(out).not.toContain("attacker.example");
    expect(out).toContain("[2]: https://ok.example/");
  });
  it("renders no link for the encoded form once sanitized", async () => {
    const { sanitizeAssistantContent } = await import("../../lib/application/sanitize-assistant");
    const { AssistantMessage } = await import("../../features/conversation/ui/AssistantMessage");
    const html = renderToStaticMarkup(createElement(AssistantMessage, { content: sanitizeAssistantContent("[Rebook](https&#58;//attacker.example/x)", new Set()) }));
    expect(html).not.toContain("attacker.example");
  });
});

describe("return-flight cache key", () => {
  it("does not serve one search's return fares to a different return date or party size", async () => {
    vi.resetModules();
    const calls: unknown[] = [];
    vi.doMock("../../packages/providers/serpapi/client", async (orig) => ({
      ...(await orig<Record<string, unknown>>()),
      searchGoogleFlights: async (q: { returnDate?: string; adults?: number }) => { calls.push(q); return { offers: [{ id: `${q.returnDate}:${q.adults}` }], insights: null }; },
    }));
    const { searchReturnOffers } = await import("../../lib/server/flight-search");
    const base = { origin: "YYZ", destination: "ZAG", originId: "YYZ", destinationId: "ZAG", departureDate: "2026-12-01", departureToken: "tok", currency: "CAD", country: "ca" };
    const first = await searchReturnOffers({ ...base, returnDate: "2026-12-20", adults: 9 } as Parameters<typeof searchReturnOffers>[0]);
    const second = await searchReturnOffers({ ...base, returnDate: "2026-12-08" } as Parameters<typeof searchReturnOffers>[0]);
    expect(calls).toHaveLength(2);
    expect(second).not.toEqual(first);
    vi.doUnmock("../../packages/providers/serpapi/client");
  });
});

describe("shared places catalog", () => {
  const planted: Place = { provider: "google-places", providerId: "ChIJ-test", name: "INJECTED", category: null, latitude: 0, longitude: 0, address: "x", sourceUrl: "https://attacker.example/", photoNames: [] };
  function fakeDb(existing: { id: string } | null) {
    const inserted: unknown[] = [];
    const chain = (table: string) => {
      const q: Record<string, unknown> = {};
      const self = () => q;
      Object.assign(q, {
        select: self, eq: self,
        maybeSingle: async () => ({ data: table === "places" ? existing : null, error: null }),
        single: async () => ({ data: existing, error: null }),
        upsert: (row: unknown) => { if (table === "places") inserted.push(row); return { select: () => ({ maybeSingle: async () => ({ data: { id: "new" }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) }; },
      });
      return q;
    };
    return { client: { from: chain } as never, inserted };
  }
  it("writes a new catalog row from the provider's data, not the request body", async () => {
    const { createPlaceRepository } = await import("../../features/places/infrastructure/placeRepository");
    const db = fakeDb(null);
    const verify = async (p: Place) => ({ ...p, name: "Real Name", address: "Real Address", sourceUrl: "https://maps.google.com/?cid=1" });
    await createPlaceRepository(db.client, db.client, verify).save("trip", planted);
    expect(JSON.stringify(db.inserted)).toContain("Real Name");
    expect(JSON.stringify(db.inserted)).not.toContain("INJECTED");
    expect(JSON.stringify(db.inserted)).not.toContain("attacker.example");
  });
  it("refuses a place its provider does not know", async () => {
    const { createPlaceRepository, UnverifiedPlaceError } = await import("../../features/places/infrastructure/placeRepository");
    const db = fakeDb(null);
    await expect(createPlaceRepository(db.client, db.client, async () => null).save("trip", planted)).rejects.toBeInstanceOf(UnverifiedPlaceError);
    expect(db.inserted).toHaveLength(0);
  });
  it("only links an existing catalog row, never rewrites it", async () => {
    const { createPlaceRepository } = await import("../../features/places/infrastructure/placeRepository");
    const db = fakeDb({ id: "existing" });
    await createPlaceRepository(db.client, db.client, async () => { throw new Error("should not verify"); }).save("trip", planted);
    expect(db.inserted).toHaveLength(0);
  });
});

describe("guest policy", () => {
  it("lets a guest draw a route map (the route now requires a session itself)", async () => {
    const { guestDecision } = await import("../../lib/guest-policy");
    expect(guestDecision("/api/route-map", "POST")).toEqual({ allow: true });
  });
});
