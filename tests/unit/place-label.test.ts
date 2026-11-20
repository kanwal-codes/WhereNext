import { describe, expect, it } from "vitest";
import { placeName } from "@/lib/place-label";

describe("placeName", () => {
  it("keeps the part a person says", () => {
    expect(placeName("Toronto, ON, Canada")).toBe("Toronto");
    expect(placeName("  Paris , France")).toBe("Paris");
  });
  it("capitalises a name typed in lower case, word by word", () => {
    expect(placeName("paris")).toBe("Paris");
    expect(placeName("new york, united states")).toBe("New York");
    expect(placeName("l'aquila")).toBe("L'Aquila");
  });
  it("leaves a name that already has capitals alone", () => {
    expect(placeName("McAllen, Texas")).toBe("McAllen");
    expect(placeName("São Paulo")).toBe("São Paulo");
  });
});
