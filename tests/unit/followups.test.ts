import { describe, expect, it } from "vitest";
import { pruneFollowups } from "../../lib/application/followups";

const chip = (label: string, prompt = label) => ({ label, prompt });

describe("pruneFollowups", () => {
  it("drops a chip the previous reply already offered", () => {
    expect(pruneFollowups([chip("Add market to day 1"), chip("Opening hours")], "Here you go.", [chip("Add market to day 1")])).toEqual([chip("Opening hours")]);
  });
  it("drops booking chips under a reply that says it can't book", () => {
    const out = pruneFollowups([chip("Book Hotel Saint-Laurent"), chip("Compare prices")], "I can't complete a booking for you.");
    expect(out).toEqual([chip("Compare prices")]);
  });
  it("keeps booking chips when the reply doesn't rule booking out", () => {
    expect(pruneFollowups([chip("Book the tour ahead")], "It usually sells out.")).toHaveLength(1);
  });
});

describe("softenBooking", () => {
  it("offers to find, never to book", async () => {
    const { softenBooking } = await import("../../lib/application/followups");
    expect(softenBooking({ label: "Book Tenement Museum tickets", prompt: "Book tickets for the Tenement Museum" })).toEqual({ label: "Find Tenement Museum tickets", prompt: "Find tickets for the Tenement Museum" });
    expect(softenBooking({ label: "Reserve a table", prompt: "Reserve a table near the hotel" }).label).toBe("Find a table");
    expect(softenBooking({ label: "Plan day 2", prompt: "Plan day 2" }).label).toBe("Plan day 2");
  });
});
