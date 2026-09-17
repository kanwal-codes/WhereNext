import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCache } from "@/lib/server/ttl-cache";
import { ticketSellerLabel } from "@/lib/ticket-provider";

// Phase 0.2.3 (docs/overhaul/roadmap/phase-0-prerequisites.md) — Eventbrite's partner terms
// require every Eventbrite-sourced event to keep showing its title and a crawlable, non-`nofollow`
// link to the Eventbrite event page. GET /api/trips/:tripId/events/detail can end up preferring a
// Ticketmaster listing for the SAME event (resolveTicketmaster searches by name/venue/date
// regardless of the original source) — this locks in that the Eventbrite link survives either way,
// as a real (non-primary, when TM wins) ticketOption, never dropped.

const TRIP = "11111111-1111-4111-8111-111111111111";
const EB_URL = "https://www.eventbrite.com/e/katseye-live-tickets-123456789";

const requireTripMemberMock = vi.fn();
const eventDetailBySearchMock = vi.fn();
const ticketmasterIdFromUrlMock = vi.fn();
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
vi.mock("@/packages/providers/ticketmaster/client", () => ({
  eventDetail: vi.fn().mockResolvedValue(null),
  eventDetailBySearch: eventDetailBySearchMock,
  ticketmasterIdFromUrl: ticketmasterIdFromUrlMock,
}));
vi.mock("@/packages/providers/tavily/client", () => ({ research: researchMock }));
vi.mock("@/packages/ai/model-policy", () => ({ generateStructured: vi.fn().mockRejectedValue(new Error("AI unavailable in test")) }));

async function getDetail(source: string, url: string) {
  const mod = await import("@/app/api/trips/[tripId]/events/detail/route");
  const q = new URLSearchParams({ name: "Katseye Live", url, source, venue: "Arena", date: "2026-06-10" });
  const req = new Request(`http://localhost/x?${q.toString()}`);
  const res = await mod.GET(req, { params: Promise.resolve({ tripId: TRIP }) });
  return res.json() as Promise<{ detail?: { title: string; source: string; url: string | null; ticketOptions: Array<{ label: string; url: string }> } }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  requireTripMemberMock.mockResolvedValue({ supabase: {}, user: { id: "u1" }, role: "owner" });
  ticketmasterIdFromUrlMock.mockReturnValue(null);
  researchMock.mockResolvedValue([]);
  process.env.TICKETMASTER_CONSUMER_KEY = "tm-key";
  process.env.TAVILY_API_KEY = "tavily-key";
});
afterEach(() => {
  vi.resetModules();
  delete process.env.TICKETMASTER_CONSUMER_KEY;
  delete process.env.TAVILY_API_KEY;
});

describe("ticketSellerLabel recognizes Eventbrite (precondition for the attribution checks below)", () => {
  it("maps 'eventbrite' to a real seller label", () => {
    expect(ticketSellerLabel("eventbrite", EB_URL)).toBe("Eventbrite");
  });
});

describe("GET /api/trips/:tripId/events/detail — Eventbrite attribution", () => {
  it("keeps the Eventbrite URL as the primary ticket link when Ticketmaster finds no match", async () => {
    eventDetailBySearchMock.mockResolvedValue(null);
    const { detail } = await getDetail("eventbrite", EB_URL);
    expect(detail?.title).toBe("Katseye Live");
    expect(detail?.source).toBe("Eventbrite");
    expect(detail?.url).toBe(EB_URL);
  });

  it("still carries a real, crawlable Eventbrite ticketOption even when Ticketmaster's own listing wins as primary", async () => {
    eventDetailBySearchMock.mockResolvedValue({
      title: "Katseye Live", url: "https://www.ticketmaster.com/event/abc123", venue: { name: "Arena" },
      date: "2026-06-10", performers: [], genre: null, priceRange: null, onSale: null, promoter: null,
      ageInfo: null, info: null, pleaseNote: null, seatmapUrl: null, doorsTime: null, status: null,
    });
    const { detail } = await getDetail("eventbrite", EB_URL);
    // Ticketmaster wins the primary slot...
    expect(detail?.source).toBe("Ticketmaster");
    expect(detail?.url).toBe("https://www.ticketmaster.com/event/abc123");
    // ...but the original Eventbrite page must still be present as a real ticket option, not dropped.
    const ebOption = detail?.ticketOptions.find((o) => o.url === EB_URL);
    expect(ebOption).toBeDefined();
    expect(ebOption?.label).toMatch(/Eventbrite/);
  });
});
