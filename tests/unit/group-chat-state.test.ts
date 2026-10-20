import { describe, expect, it } from "vitest";
import { applyReactionToggle, applyVote, buildRows, chatNotice, lastRoamMessageId, roamMentionGhost } from "../../features/group-chat/domain/chat-state";
import { MAX_MESSAGE_LENGTH, type GroupMessage } from "../../features/group-chat/domain/message";
import type { Outgoing } from "../../features/group-chat/domain/outbox";

const ME = "u-me";
const msg = (id: string, over: Partial<GroupMessage> = {}): GroupMessage => ({ id, userId: "u-a", role: "user", kind: "text", content: id, metadata: {}, created_at: "2026-10-10T10:00:00.000Z", reactions: [], ...over });
const minute = (n: number) => new Date(Date.UTC(2026, 9, 10, 10, n)).toISOString();
const day = (iso: string) => iso.slice(0, 10);

const pollMsg = (options: Array<{ key: string; label: string; count: number; mine: boolean }>, totalVotes: number) =>
  msg("p1", { kind: "poll", metadata: { poll: { id: "poll-1", options, totalVotes } } });

describe("applyVote", () => {
  const poll = () => pollMsg([{ key: "a", label: "A", count: 2, mine: false }, { key: "b", label: "B", count: 1, mine: true }], 3);
  const read = (m: GroupMessage) => (m.metadata as { poll: { options: Array<{ key: string; count: number; mine: boolean }>; totalVotes: number } }).poll;

  it("moves a vote from the old choice to the new one without changing the total", () => {
    const [m] = applyVote([poll()], "p1", "a");
    expect(read(m).options).toEqual([{ key: "a", label: "A", count: 3, mine: true }, { key: "b", label: "B", count: 0, mine: false }]);
    expect(read(m).totalVotes).toBe(3);
  });

  it("adds a first vote to the total", () => {
    const fresh = pollMsg([{ key: "a", label: "A", count: 0, mine: false }, { key: "b", label: "B", count: 0, mine: false }], 0);
    const [m] = applyVote([fresh], "p1", "b");
    expect(read(m).options.map((o) => [o.key, o.count, o.mine])).toEqual([["a", 0, false], ["b", 1, true]]);
    expect(read(m).totalVotes).toBe(1);
  });

  it("leaves your current choice as it is when you pick it again", () => {
    const [m] = applyVote([poll()], "p1", "b");
    expect(read(m).options.map((o) => [o.key, o.count, o.mine])).toEqual([["a", 2, false], ["b", 1, true]]);
    expect(read(m).totalVotes).toBe(3);
  });

  it("touches only the poll it names, and ignores a message that has none", () => {
    const other = msg("x");
    const out = applyVote([other, poll()], "x", "a");
    expect(out[0]).toBe(other);
    expect(read(out[1])).toEqual(read(poll()));
  });
});

describe("applyReactionToggle", () => {
  it("adds your first reaction", () => {
    const [m] = applyReactionToggle([msg("m")], "m", "👍");
    expect(m.reactions).toEqual([{ emoji: "👍", count: 1, mine: true }]);
  });

  it("joins an emoji others already used", () => {
    const [m] = applyReactionToggle([msg("m", { reactions: [{ emoji: "👍", count: 2, mine: false }] })], "m", "👍");
    expect(m.reactions).toEqual([{ emoji: "👍", count: 3, mine: true }]);
  });

  it("takes yours back, and removes the emoji when nobody holds it", () => {
    const m1 = applyReactionToggle([msg("m", { reactions: [{ emoji: "👍", count: 2, mine: true }] })], "m", "👍")[0];
    expect(m1.reactions).toEqual([{ emoji: "👍", count: 1, mine: false }]);
    const m2 = applyReactionToggle([msg("m", { reactions: [{ emoji: "👍", count: 1, mine: true }, { emoji: "❤️", count: 1, mine: false }] })], "m", "👍")[0];
    expect(m2.reactions).toEqual([{ emoji: "❤️", count: 1, mine: false }]);
  });

  it("leaves other messages untouched", () => {
    const a = msg("a"), b = msg("b");
    const out = applyReactionToggle([a, b], "b", "🎉");
    expect(out[0]).toBe(a);
  });
});

describe("buildRows", () => {
  const outgoing = (key: string, at = minute(30)): Outgoing => ({ key, content: `unsent ${key}`, status: "sending", created_at: at });
  const rows = (over: Partial<Parameters<typeof buildRows>[0]> = {}) =>
    buildRows({ older: [], messages: [], outbox: [], windowSize: 20, meUserId: ME, dayKey: day, ...over });

  it("shows a date divider before the first message and when the day changes", () => {
    const r = rows({ messages: [msg("1", { created_at: minute(0) }), msg("2", { created_at: minute(1) }), msg("3", { created_at: "2026-10-11T09:00:00.000Z" })] });
    expect(r.map((x) => x.showDateDivider)).toEqual([true, false, true]);
  });

  it("groups a run by the same sender within five minutes, and starts a new group after a gap or another sender", () => {
    const r = rows({
      messages: [
        msg("1", { created_at: minute(0) }),
        msg("2", { created_at: minute(2) }),
        msg("3", { created_at: minute(8) }),
        msg("4", { created_at: minute(9), userId: "u-b" }),
      ],
    });
    expect(r.map((x) => x.isFirstInGroup)).toEqual([true, false, true, true]);
  });

  it("never merges a system line into a run", () => {
    const r = rows({ messages: [msg("1", { created_at: minute(0) }), msg("2", { created_at: minute(1), kind: "system", userId: null }), msg("3", { created_at: minute(2) })] });
    expect(r.map((x) => x.isFirstInGroup)).toEqual([true, true, true]);
  });

  it("lays out only the newest windowSize confirmed messages after the older pages", () => {
    const older = [msg("o1", { created_at: minute(0) })];
    const messages = [1, 2, 3, 4].map((n) => msg(`m${n}`, { created_at: minute(n) }));
    expect(rows({ older, messages, windowSize: 2 }).map((x) => x.message.id)).toEqual(["o1", "m3", "m4"]);
  });

  it("puts unsent messages last, as your own, carrying their local state", () => {
    const o = outgoing("k1");
    const r = rows({ messages: [msg("1", { created_at: minute(0) })], outbox: [o] });
    const last = r[r.length - 1].message;
    expect(last.id).toBe("out-k1");
    expect(last.userId).toBe(ME);
    expect(last.role).toBe("user");
    expect(last.local).toBe(o);
  });

  it("does not repeat an unsent message whose delivered copy has arrived under the same key", () => {
    const r = rows({ messages: [msg("1", { clientKey: "k1", created_at: minute(0) })], outbox: [outgoing("k1"), outgoing("k2")] });
    expect(r.map((x) => x.message.id)).toEqual(["1", "out-k2"]);
  });

  it("returns nothing for an empty chat", () => {
    expect(rows()).toEqual([]);
  });
});

describe("lastRoamMessageId", () => {
  it("is the newest assistant message, or null", () => {
    expect(lastRoamMessageId([msg("1"), msg("r1", { role: "assistant" }), msg("2"), msg("r2", { role: "assistant" }), msg("3")])).toBe("r2");
    expect(lastRoamMessageId([msg("1")])).toBeNull();
  });
});

describe("roamMentionGhost", () => {
  it("offers the rest of 'Roam' for a half-typed mention", () => {
    expect(roamMentionGhost("@")).toEqual({ active: true, ghost: "Roam" });
    expect(roamMentionGhost("hey @r")).toEqual({ active: true, ghost: "oam" });
    expect(roamMentionGhost("hey @RO")).toEqual({ active: true, ghost: "am" });
    expect(roamMentionGhost("@roam")).toEqual({ active: true, ghost: "" });
  });

  it("offers nothing when the end of the text is not the start of a mention", () => {
    expect(roamMentionGhost("")).toEqual({ active: false, ghost: "" });
    expect(roamMentionGhost("hello")).toEqual({ active: false, ghost: "" });
    expect(roamMentionGhost("@bob")).toEqual({ active: false, ghost: "" });
    expect(roamMentionGhost("mail@r")).toEqual({ active: false, ghost: "" });
  });
});

describe("chatNotice", () => {
  const base = { online: true, loadFailed: false, hasMessages: true, liveDown: false, inputLength: 0 };

  it("says nothing when all is well", () => {
    expect(chatNotice(base)).toBeNull();
  });

  it("puts offline first, then a failed refresh (with a retry), then paused live updates, then the length warning", () => {
    expect(chatNotice({ ...base, online: false, loadFailed: true, liveDown: true })?.text).toMatch(/offline/);
    expect(chatNotice({ ...base, loadFailed: true, liveDown: true })).toMatchObject({ action: "retry", text: expect.stringMatching(/refresh/) });
    expect(chatNotice({ ...base, liveDown: true, inputLength: MAX_MESSAGE_LENGTH })?.text).toMatch(/Live updates are paused/);
    expect(chatNotice({ ...base, inputLength: MAX_MESSAGE_LENGTH - 500 })?.text).toMatch(/of .* characters/);
  });

  it("does not offer a retry when there is nothing on screen to be out of date", () => {
    expect(chatNotice({ ...base, loadFailed: true, hasMessages: false })).toBeNull();
  });
});
