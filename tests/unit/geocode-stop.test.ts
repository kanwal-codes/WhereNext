import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCache } from "../../lib/server/ttl-cache";

const searchMock = vi.fn();
const detailsMock = vi.fn();
vi.mock("@/packages/providers/google-places/client", () => ({
  GooglePlacesProvider: class {
    search = searchMock;
    details = detailsMock;
  },
}));

import { destinationBias, geocodeStop } from "../../lib/server/geocode-stop";
import { GooglePlacesProvider } from "@/packages/providers/google-places/client";

beforeEach(() => {
  clearMemoryCache();
  searchMock.mockReset();
  detailsMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("destinationBias", () => {
  // Phase 4 locationBias fix (docs/overhaul/roadmap/phase-4-recommendation-ranking.md), extended
  // to geocodeStop and route-plan's coordsFor: a same-named stop existing in more than one city
  // ("Central Park" isn't unique to New York) had nothing telling Google which one a trip's own
  // destination means.
  it("geocodes the destination string itself", async () => {
    searchMock.mockResolvedValue([{ latitude: 45.5, longitude: -73.6 }]);
    const bias = await destinationBias(new GooglePlacesProvider(), "Montreal, Canada");
    expect(bias).toEqual({ lat: 45.5, lng: -73.6 });
    expect(searchMock).toHaveBeenCalledWith("Montreal, Canada", undefined, 1);
  });

  it("caches by destination string — a second call for the same destination doesn't re-search", async () => {
    searchMock.mockResolvedValue([{ latitude: 45.5, longitude: -73.6 }]);
    await destinationBias(new GooglePlacesProvider(), "Montreal, Canada");
    await destinationBias(new GooglePlacesProvider(), "Montreal, Canada");
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("fails open (undefined, never throws) when nothing resolves or the provider errors", async () => {
    searchMock.mockResolvedValue([]);
    await expect(destinationBias(new GooglePlacesProvider(), "Nowhere")).resolves.toBeUndefined();
    searchMock.mockRejectedValue(new Error("provider down"));
    await expect(destinationBias(new GooglePlacesProvider(), "Somewhere Else")).resolves.toBeUndefined();
  });
});

describe("geocodeStop", () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { destination: "Montreal, Canada" } }),
        }),
      }),
    }),
  } as never;

  it("biases the per-stop search toward the trip's own destination", async () => {
    // First call (inside destinationBias) resolves the destination itself; second is the actual
    // per-stop search that should carry the resulting bias.
    searchMock.mockResolvedValueOnce([{ latitude: 45.5, longitude: -73.6 }]);
    searchMock.mockResolvedValueOnce([{ latitude: 45.52, longitude: -73.57 }]);
    const result = await geocodeStop(supabase, "trip-1", "Some Cafe");
    expect(result).toEqual({ latitude: 45.52, longitude: -73.57 });
    expect(searchMock).toHaveBeenLastCalledWith("Some Cafe, Montreal, Canada", undefined, undefined, { lat: 45.5, lng: -73.6 });
  });

  it("uses the place's own detail coordinates when a providerId is given, skipping search entirely", async () => {
    detailsMock.mockResolvedValue({ location: { latitude: 1, longitude: 2 } });
    const result = await geocodeStop(supabase, "trip-1", "Some Cafe", "provider-id-1");
    expect(result).toEqual({ latitude: 1, longitude: 2 });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when the provider fails", async () => {
    searchMock.mockRejectedValue(new Error("down"));
    await expect(geocodeStop(supabase, "trip-1", "Some Cafe")).resolves.toBeNull();
  });
});
