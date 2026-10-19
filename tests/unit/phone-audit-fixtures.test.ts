import { describe, expect, it } from "vitest";
import { assistantBlockSchema } from "../../packages/contracts/assistant";
import { edgeScenes, scenes } from "../../app/dev-phone-audit/fixtures";

// The phone redesign checks every widget from fixtures, because the local test stack has no provider keys. A fixture
// that no longer matches the contract would make those checks meaningless, so each one is parsed against it.
describe("phone audit fixtures", () => {
  for (const scene of [...scenes, ...edgeScenes]) {
    it(`${scene.label} matches the assistant block contract`, () => {
      for (const block of scene.blocks ?? []) {
        const parsed = assistantBlockSchema.safeParse(block);
        expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
      }
    });
  }
});
