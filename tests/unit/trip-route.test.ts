import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { fitLegs, needsRoute, planRoute } from "../../lib/application/trip-route";
import { clearMemoryCache } from "../../lib/server/ttl-cache";

const search = (location: string) => ({ tool: "search_places" as const, query: "top attractions", location });
const reply = (content: unknown) => async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({ object: schema.parse(content), usage: { inputTokens: 1, outputTokens: 1 } });

beforeEach(() => { clearMemoryCache(); generateObjectMock.mockReset(); });

describe("needsRoute", () => {
  it("is true for searches in two different places, or a whole country", () => {
    expect(needsRoute({ resolved: { toolPlan: [search("Paris, France"), search("Rome, Italy")], itineraryDays: 5 }, locationFocus: "Paris, France and Rome, Italy", days: 5 })).toBe(true);
    expect(needsRoute({ resolved: { toolPlan: [search("Japan")], itineraryDays: 12 }, locationFocus: "Japan", days: 12 })).toBe(true);
  });
  it("is false for one city, however many searches, and for a one-day plan", () => {
    expect(needsRoute({ resolved: { toolPlan: [search("Toronto, Canada"), search("Toronto, Canada")], itineraryDays: 5 }, locationFocus: "Toronto, Canada", days: 5 })).toBe(false);
    expect(needsRoute({ resolved: { toolPlan: [search("Paris, France"), search("Rome, Italy")], itineraryDays: 1 }, locationFocus: "Paris", days: 1 })).toBe(false);
  });
});

describe("fitLegs", () => {
  it("makes the legs add up to the days, the last leg absorbing the difference", () => {
    expect(fitLegs([{ city: "Tokyo, Japan", days: 4 }, { city: "Kyoto, Japan", days: 4 }], 10)).toEqual([{ city: "Tokyo, Japan", days: 4 }, { city: "Kyoto, Japan", days: 6 }]);
    expect(fitLegs([{ city: "Tokyo, Japan", days: 6 }, { city: "Kyoto, Japan", days: 6 }], 10)).toEqual([{ city: "Tokyo, Japan", days: 6 }, { city: "Kyoto, Japan", days: 4 }]);
  });
  it("drops a repeated city and refuses a route that is one city, or has more cities than days", () => {
    expect(fitLegs([{ city: "Tokyo, Japan", days: 3 }, { city: "Tokyo, Japan", days: 3 }], 6)).toBeNull();
    expect(fitLegs([{ city: "A, X", days: 1 }, { city: "B, X", days: 1 }, { city: "C, X", days: 1 }], 2)).toBeNull();
  });
});

describe("planRoute", () => {
  const input = { focus: "Japan", days: 12, startDate: "2027-04-02", request: "plan a 12 day trip around Japan" };

  it("returns the legs the model chose, fitted to the days, and reuses them for the same ask", async () => {
    generateObjectMock.mockImplementation(reply({ legs: [{ city: "Tokyo, Japan", days: 5 }, { city: "Kyoto, Japan", days: 4 }, { city: "Osaka, Japan", days: 2 }] }));
    expect(await planRoute(input)).toEqual([{ city: "Tokyo, Japan", days: 5 }, { city: "Kyoto, Japan", days: 4 }, { city: "Osaka, Japan", days: 3 }]);
    await planRoute(input);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("returns null, uncached, when no usable route comes back", async () => {
    generateObjectMock.mockImplementation(reply({ legs: [{ city: "Tokyo, Japan", days: 12 }] }));
    expect(await planRoute(input)).toBeNull();
    generateObjectMock.mockImplementation(reply({ legs: [{ city: "Tokyo, Japan", days: 6 }, { city: "Kyoto, Japan", days: 6 }] }));
    expect(await planRoute(input)).not.toBeNull();
  });
});
