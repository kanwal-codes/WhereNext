import { describe, expect, it } from "vitest";
import { priceBasis } from "@/features/conversation/ui/blocks/FlightWidget";

describe("priceBasis: what a fare's price covers", () => {
  it("says per person for one traveller or none given, and the total for more", () => {
    expect(priceBasis()).toBe("per person");
    expect(priceBasis(1)).toBe("per person");
    expect(priceBasis(2)).toBe("total for 2");
    expect(priceBasis(4)).toBe("total for 4");
  });
});
