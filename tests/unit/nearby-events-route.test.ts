import { beforeEach, describe, expect, it, vi } from "vitest";

const { tmMock, ebMock, searchMock } = vi.hoisted(() => ({ tmMock: vi.fn(), ebMock: vi.fn(), searchMock: vi.fn() }));
vi.mock("@/lib/server/trip-auth", () => ({ requireTripMember: vi.fn().mockResolvedValue({}), tripAuthResponse: () => null }));
vi.mock("@/packages/providers/ticketmaster/client", () => ({ events: tmMock }));
vi.mock("@/packages/providers/eventbrite/client", () => ({ localEvents: ebMock }));
vi.mock("@/packages/providers/google-places/client", () => ({ GooglePlacesProvider: class { search = searchMock; } }));

import { clearMemoryCache } from "../../lib/server/ttl-cache";

const TRIP = "11111111-1111-4111-8111-111111111111";
const tmEvent = { title: "Raptors vs Heat", url: "https://tm.example/1", date: "2026-12-19 19:30", venue: "Scotiabank Arena", imageUrl: null };
const ebEvent = { title: "Ecstatic Dance", url: "https://eb.example/1", date: "2026-12-20 10:00", venue: "A Loft", content: "", provider: "eventbrite" };

async function get(qs: string) {
  const { GET } = await import("@/app/api/trips/[tripId]/events/route");
  const res = await GET(new Request(`http://localhost/api/trips/${TRIP}/events?${qs}`), { params: Promise.resolve({ tripId: TRIP }) });
  return (await res.json()) as { events: Array<{ title: string }> };
}

beforeEach(() => {
  clearMemoryCache();
  vi.resetAllMocks();
  process.env.TICKETMASTER_CONSUMER_KEY = "k";
  process.env.EVENTBRITE_API_KEY = "k";
  tmMock.mockResolvedValue([tmEvent]);
  ebMock.mockResolvedValue([ebEvent]);
  searchMock.mockResolvedValue([{ latitude: 43.65, longitude: -79.38 }]);
});

describe("GET /events (the section under a place)", () => {
  it("uses the caller's own point for Eventbrite instead of looking the city up again", async () => {
    const body = await get("location=Toronto&lat=43.6496&lng=-79.3763");
    expect(searchMock).not.toHaveBeenCalled();
    expect(ebMock).toHaveBeenCalledWith("", 43.6496, -79.3763, expect.anything());
    expect(body.events.map((e) => e.title).sort()).toEqual(["Ecstatic Dance", "Raptors vs Heat"]);
  });

  it("looks the city up only when the caller sent no point", async () => {
    await get("location=Toronto");
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(ebMock).toHaveBeenCalledWith("", 43.65, -79.38, expect.anything());
  });

  it("ignores a point that is not a real coordinate", async () => {
    await get("location=Toronto&lat=abc&lng=999");
    expect(searchMock).toHaveBeenCalledTimes(1);
  });

  it("does not wait on a slow Eventbrite once Ticketmaster has answered, and has it for the next look", async () => {
    let finish!: (events: unknown[]) => void;
    ebMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const started = Date.now();
    const first = await get("location=Toronto&lat=43.6&lng=-79.3");
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(first.events.map((e) => e.title)).toEqual(["Raptors vs Heat"]);
    finish([ebEvent]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await get("location=Toronto&lat=43.6&lng=-79.3");
    expect(second.events.map((e) => e.title).sort()).toEqual(["Ecstatic Dance", "Raptors vs Heat"]);
    expect(ebMock).toHaveBeenCalledTimes(1);
    expect(tmMock).toHaveBeenCalledTimes(1); // cached
  });

  it("still answers, with nothing, when both providers fail, and caches neither failure", async () => {
    tmMock.mockRejectedValue(new Error("down"));
    ebMock.mockRejectedValue(new Error("down"));
    expect((await get("location=Toronto&lat=43.6&lng=-79.3")).events).toEqual([]);
    tmMock.mockResolvedValue([tmEvent]);
    expect((await get("location=Toronto&lat=43.6&lng=-79.3")).events.map((e) => e.title)).toContain("Raptors vs Heat");
  });
});
