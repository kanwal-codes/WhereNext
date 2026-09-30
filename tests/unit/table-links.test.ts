import { describe, expect, it } from "vitest";
import { mapsSearchUrl, openTableUrl } from "../../lib/table-links";

describe("openTableUrl", () => {
  it("fills in the restaurant, party size and date and time", () => {
    const url = new URL(openTableUrl({ name: "Ramiro", city: "Lisbon, Portugal", date: "2026-10-13", time: "20:30", party: 4 }));
    expect(url.origin + url.pathname).toBe("https://www.opentable.com/s");
    expect(url.searchParams.get("term")).toBe("Ramiro Lisbon, Portugal");
    expect(url.searchParams.get("covers")).toBe("4");
    expect(url.searchParams.get("dateTime")).toBe("2026-10-13T20:30");
  });
  it("uses a dinner time when none is given and drops anything invalid", () => {
    expect(new URL(openTableUrl({ name: "Ramiro", date: "2026-10-13" })).searchParams.get("dateTime")).toBe("2026-10-13T19:30");
    const url = new URL(openTableUrl({ name: "Ramiro", date: "soon", time: "7pm", party: 0 }));
    expect(url.searchParams.has("dateTime")).toBe(false);
    expect(url.searchParams.has("covers")).toBe(false);
  });
  it("escapes what the traveller typed", () => {
    expect(openTableUrl({ name: "Café & Bar #1" })).toContain("term=Caf%C3%A9+%26+Bar+%231");
    expect(new URL(openTableUrl({ name: "Café & Bar #1" })).searchParams.get("term")).toBe("Café & Bar #1");
  });
});

describe("mapsSearchUrl", () => {
  it("searches for the place in its city", () => {
    expect(new URL(mapsSearchUrl({ name: "Ramiro", city: "Lisbon" })).searchParams.get("query")).toBe("Ramiro, Lisbon");
  });
});
