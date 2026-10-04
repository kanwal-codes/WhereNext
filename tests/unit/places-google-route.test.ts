import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCache } from "@/lib/server/ttl-cache";

const TRIP = "11111111-1111-4111-8111-111111111111";

const requireTripMemberMock = vi.fn();
const detailsMock = vi.fn();
const researchMock = vi.fn();
const writeMock = vi.fn();

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
vi.mock("@/lib/application/place-about", () => ({ writePlaceAbout: writeMock }));

async function getDetails(placeId = "place-1") {
  const mod = await import("@/app/api/trips/[tripId]/places/google/route");
  const res = await mod.GET(new Request(`http://localhost/x?placeId=${encodeURIComponent(placeId)}`), { params: Promise.resolve({ tripId: TRIP }) });
  return res.json() as Promise<{ place?: { displayName?: { text?: string } }; webSummary?: unknown }>;
}
async function getAbout(placeId = "place-1") {
  const mod = await import("@/app/api/trips/[tripId]/places/google/about/route");
  const res = await mod.GET(new Request(`http://localhost/x?placeId=${encodeURIComponent(placeId)}`), { params: Promise.resolve({ tripId: TRIP }) });
  return res.json() as Promise<{ about: { content: string } | null }>;
}
const snippetsSentToWriter = () => (writeMock.mock.calls.at(-1)?.[0].snippets ?? []) as Array<{ title: string; content: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  detailsMock.mockResolvedValue({ id: "place-1", displayName: { text: "Bar George" }, formattedAddress: "1440 Rue Drummond, Montréal, QC, Canada" });
  writeMock.mockResolvedValue({ content: "A grand, wood-panelled cocktail room in Montréal, known for its Scottish menu." });
});
afterEach(() => {
  vi.resetModules();
});

describe("GET /api/trips/[tripId]/places/google", () => {
  it("returns the place at once, with no scraped web text in it", async () => {
    const body = await getDetails();
    expect(body.place?.displayName?.text).toBe("Bar George");
    expect(body.webSummary).toBeUndefined();
    expect(researchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/trips/[tripId]/places/google/about", () => {
  it("hands the writer the page's facts and only web text that is really about the place", async () => {
    researchMock.mockResolvedValue([
      { title: "Eater Montreal", url: "https://eater.com/bar-george", content: "Bar George is a grand, wood-panelled spot inside Le Mount Stephen known for its Scottish menu and clubby atmosphere." },
      { title: "Some Blog", url: "https://example.com", content: "ok" },
      { title: "Stream VOD", url: "https://example.com/vod", content: "That's like what's going on in the boardrooms behind the scenes, but it kind of is what it feels like to the crew." },
      { title: "Reviews", url: "https://example.com/r", content: "Title: Bar George Helpful Translate user-icon 4.5/5 Reviewed on Jul 2026 great place a lot of text here" },
    ]);
    const body = await getAbout();
    expect(body.about?.content).toContain("cocktail room");
    expect(writeMock.mock.calls[0][0].place.displayName.text).toBe("Bar George");
    expect(snippetsSentToWriter().map((s) => s.title)).toEqual(["Eater Montreal"]);
    expect(researchMock.mock.calls[0][0]).toContain("Bar George");
  });

  it("accepts a result that mentions the place by a close variant of its name (punctuation-insensitive)", async () => {
    researchMock.mockResolvedValue([{ title: "Local Eats", url: "https://example.com/review", content: "Bar-George at Le Mount Stephen is the city's grandest new cocktail room, all dark wood and tartan." }]);
    await getAbout();
    expect(snippetsSentToWriter()).toHaveLength(1);
  });

  it("cuts a raw scrape at an embedded splice marker before the writer sees it — live-caught: Montmorency Falls", async () => {
    detailsMock.mockResolvedValue({ id: "place-1", displayName: { text: "Montmorency Falls" }, formattedAddress: "Québec City, QC, Canada" });
    researchMock.mockResolvedValue([{
      title: "TripAdvisor", url: "https://example.com/montmorency-falls",
      content: "Montmorency Falls offers visitors a rewarding experience with its stunning natural beauty and multiple viewpoints. A visit typically lasts 2-3 hours. Visitors commend the [...] The Happy Traveler ·Jul 2026 typo'd second review",
    }]);
    await getAbout();
    expect(snippetsSentToWriter()[0].content).toBe("Montmorency Falls offers visitors a rewarding experience with its stunning natural beauty and multiple viewpoints. A visit typically lasts 2-3 hours.");
  });

  it("still writes from the listing's own facts when Tavily errors", async () => {
    researchMock.mockRejectedValue(new Error("Tavily down"));
    const body = await getAbout();
    expect(snippetsSentToWriter()).toEqual([]);
    expect(body.about).not.toBeNull();
  });

  it("is null when there is nothing good to say", async () => {
    researchMock.mockResolvedValue([]);
    writeMock.mockResolvedValue(null);
    expect((await getAbout()).about).toBeNull();
  });

  it("skips the web search and the writer when Google returned no place name", async () => {
    detailsMock.mockResolvedValue({ id: "place-1" });
    const body = await getAbout();
    expect(researchMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    expect(body.about).toBeNull();
  });

  it("caches the blurb per place id: a second lookup writes nothing new", async () => {
    researchMock.mockResolvedValue([{ title: "Eater Montreal", url: "https://eater.com/bar-george", content: "Bar George is a grand, wood-panelled spot inside Le Mount Stephen." }]);
    await getAbout();
    await getAbout();
    expect(researchMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
