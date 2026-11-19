import { describe, expect, it } from "vitest";
import { recordingEnabled } from "../../lib/server/ai-turn-record";

describe("whole-turn recording switch", () => {
  it("is on outside production and off in production unless asked", () => {
    expect(recordingEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(recordingEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(recordingEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(recordingEnabled({ NODE_ENV: "production", ROAM_RECORD_TURNS: "1" })).toBe(true);
  });

  it("can be turned off anywhere", () => {
    expect(recordingEnabled({ NODE_ENV: "development", ROAM_RECORD_TURNS: "0" })).toBe(false);
  });
});
