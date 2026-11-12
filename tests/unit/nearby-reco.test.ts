import { afterEach, describe, expect, it, vi } from "vitest";
import { classify, fetchLane, semanticScores } from "../../features/places/application/nearbyReco";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const place = (id: string) => ({ providerId: id, name: id, category: "restaurant" }) as never;
const signal = new AbortController().signal;

describe("fetchLane", () => {
  it("sends the anchor's coordinates with an events lane, so the server need not look the city up", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLane("t1", { id: "e", title: "On", source: "events", query: "" }, { name: "Swaagat", city: "Toronto", lat: 43.6, lng: -79.3 }, signal);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("location=Toronto");
    expect(url).toContain("lat=43.6");
    expect(url).toContain("lng=-79.3");
  });

  it("sends no coordinates when the anchor has none", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLane("t1", { id: "e", title: "On", source: "events", query: "" }, { name: "Swaagat", city: "Toronto" }, signal);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).not.toContain("lat=");
  });
});

describe("semanticScores", () => {
  it("returns the scores when they arrive in time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ scores: { a: 0.9 } }), { status: 200 })));
    expect(await semanticScores("t1", "anchor", [place("a")], signal)).toEqual({ a: 0.9 });
  });

  it("gives up on slow scores so the cards show in their own order, but lets the request finish for the cache", async () => {
    vi.useFakeTimers();
    let finished = false;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => { finished = true; resolve(new Response(JSON.stringify({ scores: { a: 1 } }), { status: 200 })); }, 5_000))));
    const pending = semanticScores("t1", "anchor", [place("a")], signal);
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toEqual({});
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(finished).toBe(true);
  });

  it("is empty when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await semanticScores("t1", "anchor", [place("a")], signal)).toEqual({});
  });
});

describe("classify", () => {
  it("answers a restaurant from its Google types without any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await classify("t1", "place", { name: "Swaagat", primaryType: "indian_restaurant", types: ["indian_restaurant", "restaurant", "food"], id: "p1" }, signal)).toEqual({ vibe: "food_scene" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the generic lanes when the embedding classifier is slow", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    vi.useFakeTimers();
    const pending = classify("t1", "place", { name: "Mystery Spot", id: "p2" }, signal);
    await vi.advanceTimersByTimeAsync(1_300);
    expect(await pending).toEqual({ vibe: "default" });
  });
});
