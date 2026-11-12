import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));
vi.mock("../../lib/client/mutation-queue", () => ({ mutate: mutateMock }));

import { replaceDaysInItinerary } from "../../features/conversation/application/addPlanToItinerary";

const current = [
  { title: "Old Stop", day_index: 3, metadata: null },
  { title: "Kept Stop", day_index: 3, metadata: null },
  { title: "Booked Dinner", day_index: 3, metadata: { locked: true } },
  { title: "Other Day Stop", day_index: 4, metadata: null },
];

beforeEach(() => {
  mutateMock.mockReset().mockResolvedValue({ ok: true, queued: false, status: 200 });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: current }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

const calls = () => mutateMock.mock.calls.map(([url, init]) => ({ url, method: init.method, body: init.body }));

describe("replaceDaysInItinerary", () => {
  it("removes what the new day dropped, keeps locked items and stops it still has, adds the rest, and leaves other days alone", async () => {
    const failures = await replaceDaysInItinerary("trip-1", [{ dayIndex: 3, stops: [{ title: "Kept Stop", time: "10:00" }, { title: "New Stop", time: "14:00" }] }]);
    expect(failures).toBe(0);
    const writes = calls();
    expect(writes.filter((w) => w.method === "DELETE").map((w) => (w.body as { title: string }).title)).toEqual(["Old Stop"]);
    expect(writes.filter((w) => w.method === "POST").map((w) => (w.body as { title: string; dayIndex: number }).title)).toEqual(["New Stop"]);
    expect(JSON.stringify(writes)).not.toContain("Other Day Stop");
    expect(JSON.stringify(writes)).not.toContain("Booked Dinner");
  });

  it("changes nothing when the current itinerary cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(replaceDaysInItinerary("trip-1", [{ dayIndex: 3, stops: [{ title: "New Stop" }] }])).rejects.toThrow();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("counts the writes that failed", async () => {
    mutateMock.mockResolvedValue({ ok: false, queued: false, status: 500 });
    expect(await replaceDaysInItinerary("trip-1", [{ dayIndex: 3, stops: [{ title: "New Stop" }] }])).toBe(3); // two deletes (the two unlocked stops it dropped), one add
  });
});
