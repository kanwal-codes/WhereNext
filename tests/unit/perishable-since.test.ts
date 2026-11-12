import { describe, expect, it } from "vitest";
import { perishableSince } from "@/features/conversation/ui/blocks/MessageBlocks";
import type { AssistantBlock } from "@/packages/contracts/assistant";

const block = (type: string) => ({ type }) as unknown as AssistantBlock;
const NOW = Date.parse("2026-11-11T20:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

describe("perishableSince", () => {
  it("names the day when an old answer holds flights, stays, events or a forecast", () => {
    for (const type of ["flights", "stays", "events", "weather"]) expect(perishableSince([block("place_list"), block(type)], ago(30), NOW)).toMatch(/Nov/);
  });
  it("says nothing about a fresh answer, or one with nothing that goes out of date", () => {
    expect(perishableSince([block("flights")], ago(2), NOW)).toBeNull();
    expect(perishableSince([block("place_list"), block("itinerary")], ago(300), NOW)).toBeNull();
  });
  it("says nothing when it has no time to go by", () => {
    expect(perishableSince([block("flights")], undefined, NOW)).toBeNull();
    expect(perishableSince([block("flights")], "not a date", NOW)).toBeNull();
  });
});
