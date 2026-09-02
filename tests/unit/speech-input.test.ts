import { describe, expect, it } from "vitest";
import { readResults } from "../../lib/use-speech-input";

describe("readResults", () => {
  it("joins finalized chunks and keeps the interim tail separate", () => {
    const out = readResults([
      { transcript: "five days in", isFinal: true },
      { transcript: " Lisbon", isFinal: true },
      { transcript: " from Tor", isFinal: false },
    ]);
    expect(out.final).toBe("five days in Lisbon");
    expect(out.interim).toBe("from Tor");
  });

  it("handles an all-interim run and an empty run", () => {
    expect(readResults([{ transcript: "hello", isFinal: false }])).toEqual({ final: "", interim: "hello" });
    expect(readResults([])).toEqual({ final: "", interim: "" });
  });
});
