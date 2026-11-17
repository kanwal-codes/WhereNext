import { describe, expect, it } from "vitest";
import { applyMention, mentionedUserIds, mentionOptions, mentionPattern, mentionQuery } from "@/features/group-chat/domain/mentions";
import { readTextFrames, textFrame } from "@/lib/server/ai-stream-frames";

const people = [
  { userId: "u-maya", name: "Maya Patel" },
  { userId: "u-sofia", name: "Sofia" },
  { userId: "u-mario", name: "Mario" },
  { userId: "u-zoë", name: "Zoë Åberg" },
];

describe("mentionQuery", () => {
  it("finds a half-typed mention at the end of the box", () => {
    expect(mentionQuery("hey @ma")).toEqual({ start: 4, query: "ma" });
    expect(mentionQuery("@")).toEqual({ start: 0, query: "" });
    expect(mentionQuery("hey @Zo")).toEqual({ start: 4, query: "Zo" });
  });
  it("ignores an @ inside a word, a finished mention, and text after the mention", () => {
    expect(mentionQuery("mail a@b")).toBeNull();
    expect(mentionQuery("hey @Maya ")).toBeNull();
    expect(mentionQuery("hey @Maya what")).toBeNull();
    expect(mentionQuery("no mention")).toBeNull();
  });
});

describe("mentionOptions", () => {
  it("offers anyone one of whose name's words starts with what was typed, ignoring case", () => {
    expect(mentionOptions(people, "ma").map((p) => p.userId)).toEqual(["u-maya", "u-mario"]);
    expect(mentionOptions(people, "PAT").map((p) => p.userId)).toEqual(["u-maya"]);
  });
  it("lists everyone for an empty query, up to the limit", () => {
    expect(mentionOptions(people, "")).toHaveLength(4);
    expect(mentionOptions(people, "", 2)).toHaveLength(2);
  });
  it("offers nobody when nothing fits", () => {
    expect(mentionOptions(people, "xyz")).toEqual([]);
  });
});

describe("applyMention", () => {
  it("replaces the half-typed mention with the whole name and a space", () => {
    expect(applyMention("hey @ma", 4, "Maya Patel")).toBe("hey @Maya Patel ");
  });
});

describe("mentionedUserIds", () => {
  it("reads who a message points at, each person once, whole names only", () => {
    expect(mentionedUserIds("@Maya Patel and @sofia, then @Maya Patel again", people)).toEqual(["u-maya", "u-sofia"]);
  });
  it("does not read a first name as the whole name, a longer word, or an email", () => {
    expect(mentionedUserIds("@Maya can you", people)).toEqual([]);
    expect(mentionedUserIds("@Sofiane hi", people)).toEqual([]);
    expect(mentionedUserIds("write to a@sofia.com", people)).toEqual([]);
  });
  it("handles accents and names with regular-expression characters", () => {
    expect(mentionedUserIds("hi @zoë åberg!", people)).toEqual(["u-zoë"]);
    expect(mentionedUserIds("hi @A.B (c)", [{ userId: "x", name: "A.B (c)" }])).toEqual(["x"]);
  });
  it("is empty when there is nobody to find", () => {
    expect(mentionedUserIds("@anyone", [])).toEqual([]);
    expect(mentionPattern([])).toBeNull();
  });
});

describe("readTextFrames", () => {
  it("gathers the text of whole frames and keeps the unfinished rest for the next read", () => {
    const decoder = new TextDecoder();
    const raw = decoder.decode(textFrame("Hel")) + decoder.decode(textFrame("lo")) + "data: {\"choices\":[{\"delta\":{\"con";
    const first = readTextFrames(raw);
    expect(first).toMatchObject({ text: "Hello", truncated: false });
    const second = readTextFrames(first.rest + "tent\":\" there\"}}]}\n\ndata: [DONE]\n\n");
    expect(second).toMatchObject({ text: " there", truncated: false, rest: "" });
  });
  it("notices a reply that stopped part-way", () => {
    expect(readTextFrames('data: {"truncated":true}\n\n').truncated).toBe(true);
  });
});
