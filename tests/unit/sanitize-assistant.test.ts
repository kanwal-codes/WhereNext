import { describe, expect, it } from "vitest";

describe("sanitizeAssistantContent: arithmetic on real fares", () => {
  const grounding = "Toronto to Delhi from 1,129 CAD up to 1,414 CAD. Mumbai to Toronto from 926 CAD.";
  it("keeps a total of two real fares and a saving between two, but still blanks a made-up figure", async () => {
    const { sanitizeAssistantContent } = await import("../../lib/application/sanitize-assistant");
    expect(sanitizeAssistantContent("Pairing them comes to 2,340 CAD in all.", new Set(), grounding)).toBe("Pairing them comes to 2,340 CAD in all.");
    expect(sanitizeAssistantContent("The cheaper one saves 285 CAD.", new Set(), grounding)).toBe("The cheaper one saves 285 CAD.");
    expect(sanitizeAssistantContent("Expect about 9,900 CAD in all.", new Set(), grounding)).toContain("an amount I can't verify here");
  });
  it("trims a padded list marker to one space", async () => {
    const { sanitizeAssistantContent } = await import("../../lib/application/sanitize-assistant");
    expect(sanitizeAssistantContent("-   **A** · 4.6\n*  B", new Set())).toBe("- **A** · 4.6\n* B");
  });
});
