import { describe, expect, it } from "vitest";
import { withoutEmptyComparison } from "@/lib/application/comparison";

const row = (label: string, ...cells: string[]) => ({ label, cells: [label, ...cells] });

describe("withoutEmptyComparison", () => {
  it("drops a comparison whose attributes are all unclear", () => {
    expect(withoutEmptyComparison([row("A", "unclear", "unclear", "unclear"), row("B", "unclear", "Unknown", "—")])).toBeNull();
  });
  it("drops one that is mostly unknown", () => {
    expect(withoutEmptyComparison([row("A", "quiet", "unclear", "unclear"), row("B", "lively", "unclear", "unclear")])).toBeNull();
  });
  it("keeps a real comparison and removes an empty option", () => {
    const out = withoutEmptyComparison([row("A", "quiet", "CA$120"), row("B", "lively", "CA$150"), row("C", "unclear", "unclear")]);
    expect(out?.map((r) => r.label)).toEqual(["A", "B"]);
  });
});
