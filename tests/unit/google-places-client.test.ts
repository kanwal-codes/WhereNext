import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider } from "../../packages/providers/google-places/client";

const stubSearch = (places: Array<Record<string, unknown>> = []) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const requestBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

describe("GooglePlacesProvider.search — locationBias", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends a locationBias circle when coordinates are given", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetchMock = stubSearch();
    await new GooglePlacesProvider().search("restaurants", undefined, 20, { lat: 45.5, lng: -73.6 });
    expect(requestBody(fetchMock).locationBias).toEqual({ circle: { center: { latitude: 45.5, longitude: -73.6 }, radius: 20_000 } });
  });

  it("honors a custom bias radius", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetchMock = stubSearch();
    await new GooglePlacesProvider().search("restaurants", undefined, 20, { lat: 45.5, lng: -73.6, radiusMeters: 5_000 });
    expect(requestBody(fetchMock).locationBias.circle.radius).toBe(5_000);
  });

  it("omits locationBias entirely when no coordinates are given (every pre-existing caller)", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetchMock = stubSearch();
    await new GooglePlacesProvider().search("restaurants");
    expect(requestBody(fetchMock)).not.toHaveProperty("locationBias");
  });
});
