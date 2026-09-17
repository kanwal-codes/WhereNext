import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCache } from "@/lib/server/ttl-cache";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const detailsMock = vi.fn();
const researchMock = vi.fn();

class TripAuthError extends Error {
  constructor(readonly status: 401 | 403 | 404, message: string) { super(message); this.name = "TripAuthError"; }
}

vi.mock("@/lib/server/trip-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireTripMember: requireTripMemberMock,
    tripAuthResponse: (e: unknown) => (e instanceof TripAuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null),
  };
});
vi.mock("@/packages/providers/google-places/client", () => ({
  GooglePlacesProvider: vi.fn().mockImplementation(() => ({ details: detailsMock })),
}));
vi.mock("@/packages/providers/tavily/client", () => ({ research: researchMock }));

async function getDetails(placeId = "place-1") {
  const mod = await import("@/app/api/trips/[tripId]/places/google/route");
  const req = new Request(`http://localhost/x?placeId=${encodeURIComponent(placeId)}`);
  const res = await mod.GET(req, { params: Promise.resolve({ tripId: TRIP }) });
  return res.json() as Promise<{ place?: { displayName?: { text?: string } }; webSummary?: { content: string; source: { title: string; url: string } } | null }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  detailsMock.mockResolvedValue({ id: "place-1", displayName: { text: "Bar George" }, formattedAddress: "1440 Rue Drummond, Montréal, QC, Canada" });
});
afterEach(() => {
  vi.resetModules();
});

describe("GET /api/trips/[tripId]/places/google", () => {
  it("supplements the reply with a web summary when Tavily returns real results", async () => {
    researchMock.mockResolvedValue([{ title: "Eater Montreal", url: "https://eater.com/bar-george", content: "Bar George is a grand, wood-panelled spot inside Le Mount Stephen known for its Scottish menu and clubby atmosphere." }]);
    const body = await getDetails();
    expect(body.webSummary).toEqual({
      content: "Bar George is a grand, wood-panelled spot inside Le Mount Stephen known for its Scottish menu and clubby atmosphere.",
      source: { title: "Eater Montreal", url: "https://eater.com/bar-george" },
    });
    expect(researchMock).toHaveBeenCalledWith(expect.stringContaining("Bar George"), expect.anything());
  });

  it("is null (never breaks the response) when Tavily errors", async () => {
    researchMock.mockRejectedValue(new Error("Tavily down"));
    const body = await getDetails();
    expect(body.place?.displayName?.text).toBe("Bar George");
    expect(body.webSummary ?? null).toBeNull();
  });

  it("is null when Tavily returns only thin/empty snippets", async () => {
    researchMock.mockResolvedValue([{ title: "Some Blog", url: "https://example.com", content: "ok" }]);
    const body = await getDetails();
    expect(body.webSummary ?? null).toBeNull();
  });

  it("rejects a fluent, long-enough result that never actually mentions the place — live-caught: a generic name matched an unrelated video transcript", async () => {
    researchMock.mockResolvedValue([{
      title: "Stream VOD — Season 4 Highlights",
      url: "https://example.com/vod",
      content: "That's like what's going on in the boardrooms behind the scenes, but it kind of is what it feels like. And I think they did a great job with it, maintaining the feeling to the crew.",
    }]);
    const body = await getDetails();
    expect(body.webSummary ?? null).toBeNull();
  });

  it("accepts a result that mentions the place by a close variant of its name (punctuation-insensitive)", async () => {
    researchMock.mockResolvedValue([{ title: "Local Eats", url: "https://example.com/review", content: "Bar George at Le Mount Stephen is the city's grandest new cocktail room, all dark wood and tartan." }]);
    const body = await getDetails();
    expect(body.webSummary?.content).toContain("Bar George");
  });

  it("skips the web search entirely when Google returned no place name", async () => {
    detailsMock.mockResolvedValue({ id: "place-1" });
    const body = await getDetails();
    expect(researchMock).not.toHaveBeenCalled();
    expect(body.webSummary ?? null).toBeNull();
  });

  it("caches the web summary per place id — a second lookup doesn't re-call Tavily", async () => {
    researchMock.mockResolvedValue([{ title: "Eater Montreal", url: "https://eater.com/bar-george", content: "Bar George is a grand, wood-panelled spot inside Le Mount Stephen." }]);
    await getDetails();
    await getDetails();
    expect(researchMock).toHaveBeenCalledTimes(1);
  });
});
