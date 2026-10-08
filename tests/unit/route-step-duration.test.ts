import { describe, expect, it } from "vitest";
import { parseRouteStep } from "@/features/conversation/ui/blocks/routeText";
import { travelTimeLabel } from "@/lib/application/geo";

describe("route step durations read in hours", () => {
  it("turns a stored '298 min' into '4 h 58 min'", () => {
    expect(parseRouteStep("TRANSIT Train VIA Rail → Gare Centrale (298 min)").duration).toBe("4 h 58 min");
  });

  it("leaves short and already-long durations alone", () => {
    expect(parseRouteStep("TRANSIT subway 1 → Jean-Talon (14 min)").duration).toBe("14 min");
    expect(parseRouteStep("TRANSIT Train → Ottawa (2 h 10 min)").duration).toBe("2 h 10 min");
  });

  it("a long drive estimate reads in hours", () => {
    expect(travelTimeLabel(60)).toMatch(/h/);
  });
});
