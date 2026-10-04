import { afterEach, describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<object>()), generateObject: generateObjectMock }));

import { isPolishedAbout, plainAbout, writePlaceAbout } from "../../lib/application/place-about";

const place = { displayName: { text: "Alcatraz" }, primaryType: "night_club", formattedAddress: "Ul. Ante Starčevića 4, 10000, Zagreb, Croatia", rating: 4.4, userRatingCount: 1234 };
const model = (about: unknown) => generateObjectMock.mockImplementation(async ({ schema }: { schema: { parse: (v: unknown) => unknown } }) => ({ object: schema.parse(about), usage: { inputTokens: 1, outputTokens: 1 } }));
afterEach(() => generateObjectMock.mockReset());

describe("isPolishedAbout", () => {
  it("accepts two plain sentences", () => {
    expect(isPolishedAbout("A long-running rock bar in central Zagreb, loved for loud guitars, cheap drinks and a crowd of every age.")).toBe(true);
  });
  it.each([
    ["page chrome and file names", "top of page ## NIGHT CLUB & ROCK BAR ALCATRAZ KULTNO MJESTO DOBRE ZABAVE IMG-20210818-WA0020.jpg cure2.jpg shank alkic.jpg"],
    ["a markdown heading", "Welcome to the bar ## Our menu is below and we hope that you enjoy your visit with us tonight."],
    ["a link", "Find everything about the venue at https://example.com and book a table for the weekend now."],
    ["shouting", "NIGHT CLUB ROCK BAR ALCATRAZ KULTNO MJESTO is open every day of the week from nine until late."],
    ["too short", "A bar."],
    ["no full stop", "A long-running rock bar in central Zagreb loved for loud guitars and cheap drinks"],
  ])("rejects %s", (_n, text) => expect(isPolishedAbout(text)).toBe(false));
});

describe("plainAbout", () => {
  it("states only what the listing says", () => {
    expect(plainAbout(place)).toBe("A night club in Zagreb, Croatia, rated 4.4 out of 5 from 1,234 reviews on Google.");
  });
  it("says nothing when there is no category to state", () => expect(plainAbout({ displayName: { text: "X" } })).toBeNull());
});

describe("writePlaceAbout", () => {
  it("shows the model's blurb when it is clean, with the page it leaned on", async () => {
    model({ about: "A long-running rock bar in central Zagreb, loved for loud guitars, cheap drinks and a crowd of every age.", source: 0 });
    const about = await writePlaceAbout({ place, snippets: [{ title: "Alcatraz", url: "https://night-club-alcatraz.com", content: "x".repeat(80) }] });
    expect(about).toEqual({ content: expect.stringContaining("rock bar"), source: { title: "Alcatraz", url: "https://night-club-alcatraz.com" } });
  });
  it("never shows scraped text: a messy answer falls back to the listing's own facts", async () => {
    model({ about: "top of page ## NIGHT CLUB & ROCK BAR ALCATRAZ KULTNO MJESTO IMG-20210818-WA0020.jpg cure2.jpg", source: 0 });
    const about = await writePlaceAbout({ place, snippets: [{ title: "t", url: "https://a.b", content: "y".repeat(80) }] });
    expect(about).toEqual({ content: "A night club in Zagreb, Croatia, rated 4.4 out of 5 from 1,234 reviews on Google." });
  });
  it("falls back the same way when the model is unavailable", async () => {
    generateObjectMock.mockRejectedValue(new Error("down"));
    expect((await writePlaceAbout({ place, snippets: [] }))?.content).toMatch(/^A night club in Zagreb/);
  });
});
