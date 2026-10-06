import { describe, expect, it } from "vitest";
import { historyThrough } from "@/features/group-chat/domain/message";

const m = (id: string, at: string) => ({ id, created_at: `2026-10-06T19:${at}:00Z` });

describe("historyThrough", () => {
  it("cuts the thread at the message being answered, so another member's later question is not read as the question", () => {
    const history = [m("a", "01"), m("hotels", "02"), m("parks", "02"), m("reply", "03")];
    expect(historyThrough(history, history[1]).map((x) => x.id)).toEqual(["a", "hotels"]);
    expect(historyThrough(history, history[2]).map((x) => x.id)).toEqual(["a", "hotels", "parks"]);
  });

  it("appends a target that has aged out of the fetched page, after the older messages only", () => {
    const history = [m("x", "05"), m("y", "06")];
    const old = m("old", "03");
    expect(historyThrough(history, old).map((i) => i.id)).toEqual(["old"]);
    const mid = { id: "mid", created_at: "2026-10-06T19:05:30Z" };
    expect(historyThrough([m("w", "01"), ...history], mid).map((i) => i.id)).toEqual(["w", "x", "mid"]);
  });
});
