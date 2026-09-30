import { describe, expect, it } from "vitest";
import { parseRouteStep, routeLines, splitRouteEnds } from "@/features/conversation/ui/blocks/routeText";

describe("route text", () => {
  it("lifts the shared city out of both ends", () => {
    expect(splitRouteEnds("Hôtel Saint-Laurent, Montreal, Canada", "Jean Talon Market, Montreal, Canada")).toEqual({ from: "Hôtel Saint-Laurent", to: "Jean Talon Market", where: "Montreal, Canada" });
  });
  it("keeps names that share nothing whole", () => {
    expect(splitRouteEnds("Lisbon Airport", "Belém Tower")).toEqual({ from: "Lisbon Airport", to: "Belém Tower", where: null });
  });
  it("shortens a long address to its name", () => {
    expect(splitRouteEnds("Montreal-Pierre Elliott Trudeau International Airport (YUL), Dorval, QC, Canada", "Hôtel Saint-Laurent, Montreal, Canada")).toMatchObject({ from: "Montreal-Pierre Elliott Trudeau International Airport (YUL)", to: "Hôtel Saint-Laurent, Montreal" });
  });
  it("never empties an end", () => {
    expect(splitRouteEnds("Montreal, Canada", "Montreal, Canada").from).toBe("Montreal");
  });
  it("reads a walk with a bare duration", () => {
    expect(parseRouteStep("Walk 6 min")).toMatchObject({ title: "Walk", duration: "6 min", glyph: { label: "Walk" } });
  });
  it("reads a transit leg with a bracketed duration", () => {
    expect(parseRouteStep("subway 2 → Jean-Talon (14 min)")).toMatchObject({ title: "Subway 2 → Jean-Talon", duration: "14 min" });
    expect(parseRouteStep("TRANSIT bus 208 → Cais Sodré (35 min)")).toMatchObject({ title: "Bus 208 → Cais Sodré", duration: "35 min" });
  });
  it("names the lines a route uses and leaves the walking out", () => {
    expect(routeLines(["Walk 6 min", "bus 747 → Lionel-Groulx (38 min)", "subway 1 → Berri-UQAM (9 min)", "Walk 5 min"])).toBe("Bus 747 + Subway 1");
    expect(routeLines(["Walk 12 min"])).toBe("Walking only");
  });
});
