import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock, retrieveMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn(), retrieveMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));
vi.mock("../../lib/application/retrieve", () => ({ retrieveEvidence: retrieveMock }));

import { buildTripBrief, personalize, pickKinds, placeMenu, type TripBrief, type TripKind } from "../../lib/application/trip-brief";
import { clearMemoryCache } from "../../lib/server/ttl-cache";

const kind = (label: string, over: Partial<TripKind> = {}): TripKind => ({ label, why: "", origin: "place", placeQuery: label, eventQuery: "", scale: "city", weight: 2, tags: [], intensity: "active", ...over });
const reply = (content: unknown) => async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({ object: schema.parse(content), usage: { inputTokens: 10, outputTokens: 10 } });
const input = { destination: "Toronto, Canada", startDate: "2026-10-09", preferences: { likes: ["Indian food"], dislikes: ["nightclubs"] } };

beforeEach(() => { clearMemoryCache(); generateObjectMock.mockReset(); retrieveMock.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe("pickKinds", () => {
  it("takes the strongest fit first and drops kinds with nothing to search", () => {
    const kinds = [kind("a", { weight: 1 }), kind("b", { weight: 3 }), kind("c", { weight: 2 }), kind("empty", { placeQuery: "", eventQuery: "" })];
    expect(pickKinds(kinds, 2).map((k) => k.label)).toEqual(["b", "c", "a"]);
  });

  it("keeps at least two kinds from the place itself, so narrow interests never hide what the place is known for", () => {
    const kinds = [
      ...["w1", "w2", "w3", "w4", "w5"].map((label) => kind(label, { origin: "traveller", weight: 3 })),
      kind("falls", { origin: "place", weight: 1 }), kind("markets", { origin: "place", weight: 1 }),
    ];
    const picked = pickKinds(kinds, 2).map((k) => k.label);
    expect(picked).toHaveLength(5);
    expect(picked).toEqual(expect.arrayContaining(["falls", "markets"]));
  });

  it("uses more kinds for a longer trip", () => {
    const kinds = Array.from({ length: 12 }, (_, i) => kind(`k${i}`));
    expect(pickKinds(kinds, 3)).toHaveLength(5);
    expect(pickKinds(kinds, 5)).toHaveLength(7);
    expect(pickKinds(kinds, 9)).toHaveLength(10);
  });
});

describe("placeMenu", () => {
  const menu = { confidence: "high", famousFor: "Markets, Niagara, food from everywhere", kinds: [{ label: "Waterfalls", why: "Hamilton", origin: "place", placeQuery: "waterfalls and scenic trails", eventQuery: "", scale: "day_trip", weight: 3, tags: ["waterfall", "hiking"], intensity: "active" }] };

  it("sends only the place and the month, never the traveller, and is written once for everyone", async () => {
    generateObjectMock.mockImplementation(reply(menu));
    const first = await placeMenu(input);
    expect(first?.kinds[0]).toMatchObject({ label: "Waterfalls", scale: "day_trip", tags: ["waterfall", "hiking"] });
    const sent = JSON.stringify(generateObjectMock.mock.calls[0][0].messages);
    expect(sent).toContain("October");
    expect(sent).not.toContain("Indian food");
    expect(sent).not.toContain("nightclubs");
    // Another traveller, another trip length, the same place in the same month, spelled differently: the same menu.
    await buildTripBrief({ ...input, destination: "toronto,  canada", preferences: { dislikes: ["museums"] } });
    await placeMenu({ destination: "Toronto, Canada", startDate: "2026-10-30" });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    // A different month is a different menu.
    await placeMenu({ destination: "Toronto, Canada", startDate: "2026-12-30" });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("reads the web and thinks again when the place is unfamiliar", async () => {
    generateObjectMock.mockImplementationOnce(reply({ ...menu, confidence: "low" })).mockImplementationOnce(reply(menu));
    retrieveMock.mockResolvedValue({ sources: [{ title: "Visit Tinyville", url: "https://x.example", content: "Known for its hot springs" }] });
    await placeMenu({ ...input, destination: "Tinyville" });
    expect(retrieveMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(generateObjectMock.mock.calls[1][0].messages)).toContain("hot springs");
  });

  it("returns null when nothing usable comes back, and does not cache the failure", async () => {
    generateObjectMock.mockImplementation(reply({ confidence: "high", famousFor: "", kinds: [] }));
    expect(await placeMenu(input)).toBeNull();
    generateObjectMock.mockImplementation(reply(menu));
    expect(await placeMenu(input)).not.toBeNull();
  });

  it("gives up waiting for a menu nobody has written yet, so the plan can use fixed lanes", async () => {
    generateObjectMock.mockImplementation(() => new Promise(() => undefined));
    expect(await buildTripBrief({ ...input, waitMs: 20 })).toBeNull();
  });
});

describe("personalize", () => {
  const menu: TripBrief = {
    confidence: "high",
    famousFor: "",
    kinds: [
      kind("Indian food and curry houses", { weight: 2, tags: ["indian", "food"], placeQuery: "Indian restaurants" }),
      kind("Multicultural food scene", { weight: 3, tags: ["food", "restaurants"], placeQuery: "diverse restaurants and cafes" }),
      kind("Museums and galleries", { weight: 2, tags: ["museum", "art", "history"], intensity: "calm", placeQuery: "museums and galleries" }),
      kind("Skydiving and bungee", { weight: 2, tags: ["skydiving", "bungee"], intensity: "adrenaline", placeQuery: "skydiving" }),
      kind("Snorkeling reefs", { weight: 2, tags: ["snorkeling", "water"], intensity: "adrenaline", placeQuery: "snorkeling tours" }),
      kind("Waterfalls and trails", { weight: 3, tags: ["waterfall", "hiking"], placeQuery: "waterfalls and trails" }),
      kind("Bars and live music", { weight: 2, tags: ["nightlife", "bars"], placeQuery: "bars and live music venues" }),
    ],
  };
  const labels = (brief: TripBrief) => brief.kinds.map((k) => k.label);

  it("leaves the menu alone when nothing is stated: the broad answer", () => {
    expect(labels(personalize(menu, {}))).toHaveLength(7);
  });

  it("drops only the cuisine that is disliked, keeping cafes and the place's food scene", () => {
    const out = labels(personalize(menu, { dislikes: ["Indian food"] }));
    expect(out).not.toContain("Indian food and curry houses");
    expect(out).toContain("Multicultural food scene");
  });

  it("drops what a plain dislike names, and what a broader one stands for", () => {
    expect(labels(personalize(menu, { dislikes: ["museums"] }))).not.toContain("Museums and galleries");
    expect(labels(personalize(menu, { dislikes: ["history"] }))).not.toContain("Museums and galleries");
    const noThrills = labels(personalize(menu, { dislikes: ["skydiving", "snorkeling"] }));
    expect(noThrills).not.toContain("Skydiving and bungee");
    expect(noThrills).not.toContain("Snorkeling reefs");
    expect(labels(personalize(menu, { dislikes: ["dangerous things"] }))).toEqual(expect.not.arrayContaining(["Skydiving and bungee", "Snorkeling reefs"]));
    expect(labels(personalize(menu, { dislikes: ["heights"] }))).not.toContain("Skydiving and bungee");
  });

  it("makes a like a search of its own, or boosts the kind that already covers it", () => {
    const out = personalize(menu, { likes: ["paddleboarding", "museums"] });
    expect(out.kinds.find((k) => k.placeQuery === "paddleboarding")).toMatchObject({ origin: "traveller", weight: 3 });
    expect(out.kinds.find((k) => k.label === "Museums and galleries")?.weight).toBe(3);
  });

  it("never turns a like into a search when it clashes with a dislike", () => {
    const out = personalize(menu, { likes: ["skydiving"], dislikes: ["skydiving"] });
    expect(out.kinds.some((k) => k.placeQuery === "skydiving")).toBe(false);
  });

  it("keeps thrills out of a trip with accessibility needs or small children, and softens them for a relaxed pace", () => {
    expect(labels(personalize(menu, { accessibilityNeeds: ["wheelchair"] }))).not.toContain("Skydiving and bungee");
    const family = labels(personalize(menu, { groupType: "family with kids" }));
    expect(family).not.toContain("Snorkeling reefs");
    expect(family).not.toContain("Bars and live music");
    expect(personalize(menu, { pace: "relaxed" }).kinds.find((k) => k.label === "Skydiving and bungee")?.weight).toBe(1);
  });
});
