import { describe, expect, it } from "vitest";
import { ungroundedFallback } from "@/lib/application/orchestrate/fallback-reply";

describe("ungroundedFallback", () => {
  it("names the place, says what happened plainly, and offers three asks for it", () => {
    const { content, actions } = ungroundedFallback("Toronto, Ontario, Canada", []);
    expect(content).toContain("results for Toronto just now");
    expect(content).not.toMatch(/providers returned nothing/i);
    expect(actions).toMatchObject({ type: "actions", items: [{ label: "Things to do in Toronto" }, { label: "Places to eat" }, { label: "Where to stay" }] });
  });

  it("keeps the followups RESOLVE already produced", () => {
    const mine = [{ label: "Clubs in Pune", prompt: "What are the best nightclubs in Pune?" }];
    expect(ungroundedFallback("Pune", mine).actions).toMatchObject({ items: mine });
  });

  it("still reads well with no place and offers no chips", () => {
    const { content, actions } = ungroundedFallback(null, []);
    expect(content).toContain("for that just now");
    expect(actions).toBeNull();
  });
});
