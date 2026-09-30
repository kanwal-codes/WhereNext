import { describe, expect, it } from "vitest";
import { checklistKey } from "@/features/conversation/ui/blocks/ChecklistBlock";

const groups = [{ title: "Packing", items: [{ text: "Rain shell" }, { text: "Adapter" }] }];

describe("checklistKey", () => {
  it("is stable for the same list and differs per trip", () => {
    expect(checklistKey("t1", groups)).toBe(checklistKey("t1", groups));
    expect(checklistKey("t1", groups)).not.toBe(checklistKey("t2", groups));
  });
  it("changes when the items change, so a regenerated list starts clean", () => {
    expect(checklistKey("t1", groups)).not.toBe(checklistKey("t1", [{ title: "Packing", items: [{ text: "Rain shell" }] }]));
  });
  it("ignores the explanatory text", () => {
    expect(checklistKey("t1", groups)).toBe(checklistKey("t1", [{ title: "Packing", items: [{ text: "Rain shell", why: "x" }, { text: "Adapter" }] }]));
  });
});
