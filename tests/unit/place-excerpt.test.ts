import { describe, expect, it } from "vitest";
import { cleanExcerpt, isScrapeJunk } from "@/lib/server/place-excerpt";

describe("place excerpt", () => {
  it("flags a scraped review dump", () => {
    expect(isScrapeJunk("\uE0B0Translate Chocolate lovers, this is your spot. Reviewed on Feb 27, 2026 Helpful user-icon 4.0/5 Excellent")).toBe(true);
  });
  it("flags a page-title prefix", () => {
    expect(isScrapeJunk("Title: C'ChoColat - Dessert restaurant in Montréal - Weeblyte C'ChoColat is a haven")).toBe(true);
  });
  it("keeps a real description", () => {
    expect(isScrapeJunk("A cosy dessert shop known for crepes and milkshakes downtown.")).toBe(false);
  });
  it("cuts at a splice marker and ends on a full sentence", () => {
    expect(cleanExcerpt("Great falls near the city. Worth a full afternoon. The Happy Traveler ·Jul 2026 nice")).toBe("Great falls near the city. Worth a full afternoon.");
  });
  it("starts at a full sentence and tidies stray punctuation", () => {
    expect(cleanExcerpt(", and solo places are what I prefer, but chains can do well (see Bawarchi). . Masakali does a great job. Wait... really ?")).toBe("Masakali does a great job. Wait... really?");
  });
});
