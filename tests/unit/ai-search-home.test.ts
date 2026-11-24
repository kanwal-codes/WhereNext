import { beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
vi.mock("@/packages/ai/model-policy", () => ({ generateStructured: (...a: unknown[]) => generateStructured(...a) }));

import { parseAiSearch, tidyAnswer } from "@/lib/application/ai-search";

// 2026-12-02 is a Wednesday.
const ctx = { today: "2026-12-02" };
beforeEach(() => generateStructured.mockReset());

describe("an ask for a meal, with no trip", () => {
  it("takes the place and what to look for from the model, and the party, day and time from the words", async () => {
    generateStructured.mockResolvedValue({ freeText: "ramen", location: "Lisbon", adults: 2, time: "19:00", interpretation: "Ramen in Lisbon" });
    const d = await parseAiSearch("eat", "ramen in lisbon saturday at 8pm for 4", ctx);
    expect(d).toMatchObject({ freeText: "ramen", location: "Lisbon", adults: 4, time: "20:00", date: "2026-12-05" });
  });
  it("passes the written answer through, trimmed of nothing and with the filters beside it", async () => {
    generateStructured.mockResolvedValue({ freeText: "vegan indian", location: "Toronto", answer: "Vegan Indian in Toronto. Menus can’t be checked here, so call ahead about gluten.", interpretation: "x" });
    const d = await parseAiSearch("eat", "vegan indian in toronto, no gluten", ctx);
    expect(d).toMatchObject({ freeText: "vegan indian", location: "Toronto", answer: expect.stringContaining("call ahead") });
  });
  it("sets the answer with curly apostrophes and tidy spaces", async () => {
    generateStructured.mockResolvedValue({ freeText: "ramen", answer: "Menus can't be checked  here.\n" });
    expect((await parseAiSearch("eat", "ramen", ctx)).answer).toBe("Menus can\u2019t be checked here.");
  });
  it("asks the model for the answer in the right voice: grounded, short, with the allergy caution", async () => {
    generateStructured.mockResolvedValue({});
    await parseAiSearch("eat", "vegan indian", ctx);
    const system = (generateStructured.mock.calls[0]![1] as Array<{ content: string }>)[0]!.content;
    expect(system).toContain("answer:");
    expect(system).toContain("never invent place names");
    expect(system).toContain("menus can't be checked");
  });
  it("leaves an answer that is far too long out, rather than showing a wall of text", async () => {
    // The model's output is validated against the directive schema by generateStructured; here the schema itself is exercised.
    const { aiSearchSchemaForTest } = await import("@/lib/application/ai-search");
    expect(aiSearchSchemaForTest.parse({ answer: "x".repeat(500), freeText: "ramen" })).toMatchObject({ freeText: "ramen", answer: undefined });
  });
  it("tells the model what day it is, so a weekday can be worked out", async () => {
    generateStructured.mockResolvedValue({});
    await parseAiSearch("eat", "brunch on sunday", ctx);
    const system = (generateStructured.mock.calls[0]![1] as Array<{ content: string }>)[0]!.content;
    expect(system).toContain("Today is 2026-12-02");
  });
});

describe("an ask for flights, with no trip", () => {
  it("takes the two places from the model and the days and party from the words", async () => {
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Lisbon", depart: "2026-01-01", adults: 1 });
    const d = await parseAiSearch("flights", "toronto to lisbon dec 10-17 for 2", ctx);
    expect(d).toMatchObject({ from: "Toronto", to: "Lisbon", depart: "2026-12-10", ret: "2026-12-17", adults: 2 });
  });
  it("reads one way from the words", async () => {
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Paris" });
    expect(await parseAiSearch("flights", "toronto to paris one way dec 12", ctx)).toMatchObject({ oneWay: true, depart: "2026-12-12" });
  });
});

describe("an ask for a stay, with no trip", () => {
  it("reads a sentence of dates, stars and a price without the model", async () => {
    const d = await parseAiSearch("stays", "dec 10-14 under 150 4 stars for 2", ctx);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(d).toMatchObject({ checkin: "2026-12-10", checkout: "2026-12-14", priceMax: 150, stars: [4], adults: 2 });
  });
});

describe("the written answer for a stay and for a flight", () => {
  it("is asked for, with the same rules, in both prompts", async () => {
    generateStructured.mockResolvedValue({});
    await parseAiSearch("stays", "somewhere quiet in porto", ctx);
    await parseAiSearch("flights", "toronto to lisbon in december", ctx);
    const [stays, flights] = generateStructured.mock.calls.map((c) => (c[1] as Array<{ content: string }>)[0]!.content);
    expect(stays).toContain("answer:");
    expect(stays).toContain("never invent hotel names, prices, ratings or availability");
    expect(flights).toContain("answer:");
    expect(flights).toContain("never invent airlines, prices, times, routes or availability");
  });
  it("comes back with the filters, set in the app's typography", async () => {
    generateStructured.mockResolvedValue({ location: "Porto", stars: [4], answer: "4-star stays in Porto. Prices are for the whole stay, so they can't be compared per night." });
    const stays = await parseAiSearch("stays", "4 stars in porto", ctx);
    expect(stays).toMatchObject({ location: "Porto", stars: [4], answer: expect.stringContaining("can\u2019t") });
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Lisbon", answer: "Toronto to Lisbon. Prices shown are per person." });
    expect(await parseAiSearch("flights", "toronto to lisbon", ctx)).toMatchObject({ from: "Toronto", to: "Lisbon", answer: "Toronto to Lisbon. Prices shown are per person." });
  });
});

describe("tidyAnswer: whatever the model wrote, the answer on the page is plain, short and in our typography", () => {
  it("turns a single-quoted phrase into curly quotes, opening and closing", () => {
    expect(tidyAnswer("I left it open. 'Somewhere warm' is not a place, and it isn't one.")).toBe("I left it open. \u2018Somewhere warm\u2019 is not a place, and it isn\u2019t one.");
  });
  it("strips markdown and emoji, curls apostrophes, calms exclamation marks", () => {
    expect(tidyAnswer("**I looked** for vegan places \u{1F331}! Menus can't be checked here.")).toBe("I looked for vegan places . Menus can\u2019t be checked here.");
  });
  it("leaves a sensible answer as it is", () => {
    const ok = "I looked for ramen in Lisbon for four on Saturday evening. Booking ahead helps at that hour.";
    expect(tidyAnswer(ok)).toBe(ok);
  });
  it("drops a fragment too short to say anything", () => {
    expect(tidyAnswer("Done.")).toBeUndefined();
    expect(tidyAnswer("   ")).toBeUndefined();
    expect(tidyAnswer(undefined)).toBeUndefined();
  });
  it("cuts a wall of text at a sentence, never mid-sentence", () => {
    const sentence = "I looked for quiet vegetarian friendly places near the old town for two on Saturday. ";
    const long = sentence.repeat(8).trim();
    const out = tidyAnswer(long)!;
    expect(out.split(" ").length).toBeLessThanOrEqual(60);
    expect(out.endsWith(".")).toBe(true);
  });
  it("cuts one endless sentence at a word, with an ellipsis", () => {
    const out = tidyAnswer(Array.from({ length: 90 }, (_, i) => `word${i}`).join(" "))!;
    expect(out.endsWith("\u2026")).toBe(true);
    expect(out.split(" ").length).toBeLessThanOrEqual(60);
  });
});

describe("a place that is no place", () => {
  it("is left out, so the page keeps the one it has", async () => {
    generateStructured.mockResolvedValue({ location: "near me", freeText: "pizza" });
    expect((await parseAiSearch("eat", "pizza near me", ctx)).location).toBeUndefined();
    generateStructured.mockResolvedValue({ location: "Toronto", freeText: "pizza" });
    expect((await parseAiSearch("eat", "pizza in toronto", ctx)).location).toBe("Toronto");
  });
});

describe("an answer the model got slightly wrong, put right before it reaches the page", () => {
  it("drops a check-out that comes before the check-in, so the stay keeps the length the words asked for", async () => {
    generateStructured.mockResolvedValue({ location: "Banff", checkin: "2026-12-26", checkout: "2025-12-31", nights: 5 });
    const d = await parseAiSearch("stays", "banff 5 nights from dec 26", ctx);
    expect(d).toMatchObject({ checkin: "2026-12-26", nights: 5 });
    expect(d.checkout).toBeUndefined();
  });
  it("drops a date already past (a model in the wrong year)", async () => {
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Lisbon", depart: "2025-12-20" });
    expect((await parseAiSearch("flights", "toronto to lisbon", ctx)).depart).toBeUndefined();
  });
  it("tells the model where the page is already looking, so it never asks for a city the page has", async () => {
    generateStructured.mockResolvedValue({});
    await parseAiSearch("eat", "hangover cure", { ...ctx, place: "Toronto" });
    const system = (generateStructured.mock.calls.at(-1)![1] as Array<{ content: string }>)[0]!.content;
    expect(system).toContain("already showing places around Toronto");
  });
  it("takes the 'please' out of an answer, and puts straight quotes right", () => {
    expect(tidyAnswer("Menus can't be checked, so please call ahead about \"nut-free\" dishes.")).toBe("Menus can\u2019t be checked, so call ahead about \u201Cnut-free\u201D dishes.");
    expect(tidyAnswer("I looked for brunch spots. Please add a city and I can narrow it down.")).toBe("I looked for brunch spots. Add a city and I can narrow it down.");
  });
});

describe("what the written answer is allowed to say", () => {
  const systemFor = async (scope: "stays" | "eat" | "flights", q: string) => {
    generateStructured.mockResolvedValue({});
    await parseAiSearch(scope, q, { ...ctx, place: "Lisbon" });
    return (generateStructured.mock.calls.at(-1)![1] as Array<{ content: string }>)[0]!.content;
  };
  it("is one set of rules on every page: say what they cannot see, leave out receipts, nags and filler", async () => {
    for (const scope of ["stays", "eat", "flights"] as const) {
      const system = await systemFor(scope, "something nice");
      expect(system).toContain("do not list them back");
      expect(system).toContain("Never say what you did not set");
      expect(system).toContain("Never offer a next step");
      expect(system).toContain("never more than two sentences");
    }
  });
  it("tells the model what the page cannot set, so the answer says so instead of claiming it", async () => {
    expect(await systemFor("stays", "a place with a pool")).toContain("This page cannot set: a pool");
    expect(await systemFor("eat", "cheap eats")).toContain("This page cannot set: a price level");
    expect(await systemFor("flights", "business class")).toContain("This page cannot set: a cabin class");
  });
  it("tells the model what the words already fixed, so it does not repeat, ask for or contradict it", async () => {
    const system = await systemFor("stays", "dec 10 to dec 14, near the old town");
    expect(system).toContain("Already set from their words");
    expect(system).toContain("checkin");
  });
  it("does not ask flights for a return day: the page searches without one", async () => {
    expect(await systemFor("flights", "toronto to paris dec 3")).toContain("never ask for one");
  });
});

describe("what the page would ignore or the words never said is dropped", () => {
  it("drops a sort on Flights, a keyword on Stays, a made-up one-way trip and a made-up party of one", async () => {
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Dubai", depart: "2026-12-05", sort: "price", oneWay: true, adults: 1, answer: "I searched flights from Toronto to Dubai." });
    const f = await parseAiSearch("flights", "business class to dubai dec 5", ctx);
    expect(f).toMatchObject({ from: "Toronto", to: "Dubai", depart: "2026-12-05" });
    expect(f).not.toHaveProperty("sort");
    expect(f.oneWay).toBeUndefined();
    expect(f.adults).toBeUndefined();
    generateStructured.mockResolvedValue({ location: "Lisbon", freeText: "pool" });
    expect((await parseAiSearch("stays", "somewhere with a pool", ctx)).freeText).toBeUndefined();
  });
  it("keeps one way when the words say it, and a party the words state", async () => {
    generateStructured.mockResolvedValue({ from: "Toronto", to: "Vancouver", oneWay: true, adults: 2 });
    expect(await parseAiSearch("flights", "one way toronto to vancouver dec 12 for 2", ctx)).toMatchObject({ oneWay: true, adults: 2, depart: "2026-12-12" });
  });
});
