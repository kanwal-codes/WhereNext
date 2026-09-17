import { describe, expect, it } from "vitest";
import { isTrivialTurn, trivialTurnKind } from "../../lib/application/orchestrate/turn-complexity";

const TRIVIAL_PHRASES = [
  "hi", "hello", "hey", "thanks", "thank you", "ty", "ok", "okay", "cool", "nice", "great",
  "awesome", "perfect", "sounds good", "got it", "sure", "yes", "no", "bye", "goodbye",
  "see you", "later",
];

describe("isTrivialTurn — positive cases", () => {
  it.each(TRIVIAL_PHRASES)("matches %j exactly, lowercase, trimmed", (phrase) => {
    expect(isTrivialTurn(phrase)).toBe(true);
  });

  it.each(TRIVIAL_PHRASES)("matches %j uppercased", (phrase) => {
    expect(isTrivialTurn(phrase.toUpperCase())).toBe(true);
  });

  it.each(TRIVIAL_PHRASES)("matches %j with leading/trailing whitespace", (phrase) => {
    expect(isTrivialTurn(`  ${phrase}  `)).toBe(true);
  });

  it.each(TRIVIAL_PHRASES)("matches %j with trailing punctuation", (phrase) => {
    expect(isTrivialTurn(`${phrase}!`)).toBe(true);
    expect(isTrivialTurn(`${phrase}.`)).toBe(true);
    expect(isTrivialTurn(`${phrase}?`)).toBe(true);
    expect(isTrivialTurn(`${phrase}...`)).toBe(true);
  });
});

describe("isTrivialTurn — negative cases (must NOT match)", () => {
  const nonTrivial = [
    "hi, what's a good restaurant in Rome?",
    "hi there",
    "hi there, quick question",
    "hello, quick question about Rome",
    "hey, what's good in Rome?",
    "thanks for that, what about tomorrow?",
    "thanks a lot",
    "ok let's do that then",
    "okay so what about the second day",
    "yes please book it",
    "no thanks",
    "great, what else",
    "sure, what time",
    "is $150 a day enough for Lisbon?",
    "what's the weather like in May?",
    "",
    "   ",
    "hii",
    "heyy",
    "thnx",
    "kk",
  ];
  it.each(nonTrivial)("does not match %j", (message) => {
    expect(isTrivialTurn(message)).toBe(false);
  });
});

describe("trivialTurnKind", () => {
  it("returns null for anything isTrivialTurn rejects", () => {
    expect(trivialTurnKind("hi there")).toBeNull();
    expect(trivialTurnKind("")).toBeNull();
  });

  it("sorts each phrase into the right kind", () => {
    expect(trivialTurnKind("hi")).toBe("greeting");
    expect(trivialTurnKind("Hello!")).toBe("greeting");
    expect(trivialTurnKind("thanks")).toBe("thanks");
    expect(trivialTurnKind("thank you")).toBe("thanks");
    expect(trivialTurnKind("bye")).toBe("farewell");
    expect(trivialTurnKind("see you")).toBe("farewell");
    expect(trivialTurnKind("ok")).toBe("acknowledgment");
    expect(trivialTurnKind("yes")).toBe("acknowledgment");
    expect(trivialTurnKind("no")).toBe("acknowledgment");
  });
});
