import { describe, expect, it } from "vitest";
import { mergeEventSources } from "../../lib/application/nearby-events";

describe("mergeEventSources", () => {
  it("keeps both providers' distinct events, interleaved", () => {
    const tm = [{ title: "Jazz Night", url: "tm/1", date: "2026-05-01", venue: "Blue Room", source: "ticketmaster" }];
    const eb = [{ title: "Comedy Show", url: "eb/1", date: "2026-05-02", venue: "The Attic", source: "eventbrite" }];
    expect(mergeEventSources(tm, eb).map((e) => e.title)).toEqual(["Jazz Night", "Comedy Show"]);
  });

  it("drops a provider's duplicate of the same real event (same title + date), keeping the first-seen listing", () => {
    const tm = [{ title: "Katseye Live", url: "tm/1", date: "2026-06-10", venue: "Arena", source: "ticketmaster" }];
    const eb = [{ title: "katseye live", url: "eb/1", date: "2026-06-10", venue: "Arena", source: "eventbrite" }];
    const merged = mergeEventSources(tm, eb);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe("tm/1"); // Ticketmaster's listing wins as the first-seen one
  });

  it("keeps two same-titled events on different dates (a recurring show)", () => {
    const tm = [{ title: "Open Mic", url: "tm/1", date: "2026-06-10", venue: "Bar", source: "ticketmaster" }];
    const eb = [{ title: "Open Mic", url: "eb/1", date: "2026-06-17", venue: "Bar", source: "eventbrite" }];
    expect(mergeEventSources(tm, eb)).toHaveLength(2);
  });
});
