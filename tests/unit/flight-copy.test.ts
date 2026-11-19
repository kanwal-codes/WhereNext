import { describe, expect, it } from "vitest";
import { boardItem, shortAirline, tradeoffText } from "../../features/conversation/ui/blocks/flightCopy";
import { tradeoff } from "../../lib/application/flight-tradeoff";

const fmt = (n: number, c: string) => `${c === "CAD" ? "CA$" : ""}${n.toLocaleString("en")}`;

describe("flight copy", () => {
  it("shortens a long airline string for a tile", () => {
    expect(shortAirline("Air Canada")).toBe("Air Canada");
    expect(shortAirline("Air Canada · SWISS")).toBe("Air Canada +1");
    expect(shortAirline("Air Canada + 2 more")).toBe("Air Canada +2");
    expect(shortAirline("Air Canada, Lufthansa + 1 more")).toBe("Air Canada +2");
  });

  it("says what is on board in plain words", () => {
    expect(boardItem("Free Wi-Fi")).toEqual({ icon: "wifi", text: "Free Wi-Fi" });
    expect(boardItem("Wi-Fi for a fee")).toEqual({ icon: "wifi", text: "Wi-Fi (paid)" });
    expect(boardItem("In-seat power & USB outlets")).toEqual({ icon: "power", text: "Power and USB at your seat" });
    expect(boardItem("In-seat USB outlet")).toEqual({ icon: "power", text: "USB at your seat" });
    expect(boardItem("On-demand video")).toEqual({ icon: "video", text: "On-demand video" });
    expect(boardItem("Lie-flat seat")).toEqual({ icon: "other", text: "Lie-flat seat" });
  });

  it("writes the trade-off under the picks, or nothing when one fare is both", () => {
    const real = tradeoff([{ price: 2207, minutes: 1030, stops: 1 }, { price: 1846, minutes: 1575, stops: 2 }, { price: 2658, minutes: 880, stops: 0 }])!;
    expect(tradeoffText(real, "CAD", fmt)).toBe("The cheapest is CA$812 (31%) less than the nonstop, but takes 11h 35m longer.");
    const small = tradeoff([{ price: 1000, minutes: 600, stops: 1 }, { price: 970, minutes: 1000, stops: 1 }])!;
    expect(tradeoffText(small, "CAD", fmt)).toBe("The cheapest is only CA$30 (3%) less than the fastest, and takes 6h 40m longer.");
    const same = tradeoff([{ price: 800, minutes: 500, stops: 0 }, { price: 900, minutes: 700, stops: 1 }])!;
    expect(tradeoffText(same, "CAD", fmt)).toBeNull();
  });
});
