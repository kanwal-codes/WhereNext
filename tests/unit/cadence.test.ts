import { describe, expect, it } from "vitest";
import { askedForDatesRecently } from "../../lib/application/orchestrate/cadence";

const roam = (content: string) => ({ role: "assistant" as const, content });
const you = (content: string) => ({ role: "user" as const, content });

describe("askedForDatesRecently", () => {
  it("sees a recent question about dates or length", () => {
    expect(askedForDatesRecently([you("somewhere in europe"), roam("Slovenia is great. When are you thinking of going, and for roughly how long?")])).toBe(true);
    expect(askedForDatesRecently([roam("Should I look at Amsterdam first? If so, what dates are you thinking of?")])).toBe(true);
    expect(askedForDatesRecently([roam("Rough dates would let me check Toronto flights. Which city first?")])).toBe(true);
  });
  it("does not mistake a statement or an unrelated question for it", () => {
    expect(askedForDatesRecently([roam("Your dates are set to Oct 27 to Oct 30.")])).toBe(false);
    expect(askedForDatesRecently([roam("Do you want the cheaper hostel or the nicer hotel?")])).toBe(false);
  });
  it("only looks at the last few replies, and only at Roam's own", () => {
    const old = [roam("What dates are you thinking of?"), you("a"), roam("ok"), you("b"), roam("ok"), you("c"), roam("ok")];
    expect(askedForDatesRecently(old)).toBe(false);
    expect(askedForDatesRecently([you("What dates are you free?")])).toBe(false);
  });
});
