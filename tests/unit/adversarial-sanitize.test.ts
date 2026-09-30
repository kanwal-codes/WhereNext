import { describe, expect, it } from "vitest";
import { sanitizeAssistantContent } from "../../lib/application/sanitize-assistant";
import { stripReasoning, createReasoningGate } from "../../lib/ai/strip-reasoning";

/**
 * These tests hammer the two "the model must not be able to say X" gates:
 *  - sanitizeAssistantContent: no link/URL the evidence didn't provide reaches the user.
 *  - stripReasoning / createReasoningGate: no reasoning-model scratchpad reaches the user.
 * A failing test here is a real hole, not a style nit — read the FINDINGS comments.
 */

describe("sanitizeAssistantContent — link laundering attempts", () => {
  const ALLOWED = new Set(["https://official.example/a", "https://maps.example/b"]);
  const clean = (s: string) => sanitizeAssistantContent(s, ALLOWED);

  it("strips a bare invented URL", () => {
    expect(clean("Book at https://evil.example/pay now")).toBe("Book at  now");
  });

  it("keeps a bare URL that IS in the evidence", () => {
    expect(clean("See https://official.example/a")).toBe("See https://official.example/a");
  });

  it("demotes an invented markdown link to just its label", () => {
    expect(clean("[cheap tickets](https://evil.example/x)")).toBe("cheap tickets");
  });

  it("keeps a markdown link whose target is in the evidence", () => {
    expect(clean("[official](https://official.example/a)")).toBe("[official](https://official.example/a)");
  });

  it("does not treat `allowed.com@evil.com` as the allowed host", () => {
    // userinfo trick: the real host is evil.example, allow-list has official.example
    const out = clean("[book](https://official.example/a@evil.example/pay)");
    expect(out).not.toContain("evil.example");
  });

  it("scrubs an invented URL embedded inside an otherwise-allowed link's label", () => {
    const out = clean("[see https://evil.example/x for more](https://official.example/a)");
    expect(out).not.toContain("evil.example");
  });

  it("strips an invented URL hidden in an HTML anchor (not markdown)", () => {
    const out = clean('<a href="https://evil.example/x">click</a>');
    expect(out).not.toContain("evil.example");
  });

  it("strips a case-obfuscated invented link", () => {
    expect(clean("Go to HtTpS://evil.example/y now")).not.toMatch(/evil\.example/i);
  });

  it("KNOWN GAP: a scheme-less protocol-relative host is not stripped", () => {
    // Documented, low severity: `//host` isn't a URL to the regex and isn't auto-linked by the
    // chat's markdown renderer. Left as-is so the gap is visible if the renderer ever changes.
    expect(clean("see //evil.example/x")).toContain("//evil.example/x");
  });

  it("handles a pathological repeated-bracket payload without hanging", () => {
    const payload = `${"[".repeat(5000)}x${"]".repeat(5000)}(https://evil.example/x)`;
    const start = Date.now();
    const out = clean(payload);
    expect(Date.now() - start).toBeLessThan(1000); // no catastrophic backtracking
    expect(out).not.toContain("evil.example");
  });

  it("FIXED: a same-origin relative image URL is checked against the allow-list, not skipped", () => {
    // The photo proxy (/api/trips/<id>/places/google/photo?...) is a relative URL added to
    // allowedUrls by assistant-turn.ts — the old https?://-only regex silently never matched
    // this shape at all, so an unvetted relative URL (e.g. a different trip's photo endpoint)
    // reached the renderer with no allow-list check whatsoever.
    const allowed = new Set(["https://official.example/a", "/api/trips/aaa/places/google/photo?name=p1"]);
    const clean = (s: string) => sanitizeAssistantContent(s, allowed);
    expect(clean("![museum](/api/trips/aaa/places/google/photo?name=p1)")).toBe("![museum](/api/trips/aaa/places/google/photo?name=p1)");
    expect(clean("![other trip](/api/trips/bbb/places/google/photo?name=p1)")).toBe("");
  });

  it("FIXED: a same-origin relative markdown link is checked against the allow-list, not skipped", () => {
    const allowed = new Set(["/join/abc123"]);
    const clean = (s: string) => sanitizeAssistantContent(s, allowed);
    expect(clean("[join here](/join/abc123)")).toBe("[join here](/join/abc123)");
    expect(clean("[reset your password](/admin/reset-password)")).toBe("reset your password");
  });

  it("strips every invented link in a long mixed blob, keeps every allowed one", () => {
    const blob = Array.from({ length: 200 }, (_, i) =>
      i % 2 ? `[a](https://official.example/a)` : `[b](https://evil.example/${i})`).join(" and ");
    const out = clean(blob);
    expect(out).not.toContain("evil.example");
    expect(out).toContain("https://official.example/a");
  });
});

describe("sanitizeAssistantContent — unverified price claims", () => {
  const GROUNDING = JSON.stringify({ hotels: [{ name: "Hotel A", nightlyPrice: "120" }], flights: [{ price: "450 USD" }] });

  it("neutralizes a currency amount that never appears in the evidence", () => {
    const out = sanitizeAssistantContent("It's usually around $80 a night.", new Set(), GROUNDING);
    expect(out).not.toContain("$80");
    expect(out).toContain("an amount I can't verify here");
  });

  it("leaves a plain number alone (not a price) even with grounding supplied", () => {
    expect(sanitizeAssistantContent("It's a 3 day trip, see you on Day 2.", new Set(), GROUNDING)).toBe("It's a 3 day trip, see you on Day 2.");
  });

  it("keeps a currency amount that IS backed by the evidence", () => {
    expect(sanitizeAssistantContent("Flights run about 450 USD.", new Set(), GROUNDING)).toBe("Flights run about 450 USD.");
  });

  it("does nothing when no grounding text is supplied (existing callers unaffected)", () => {
    expect(sanitizeAssistantContent("It's usually around $80 a night.", new Set())).toBe("It's usually around $80 a night.");
  });

  it("keeps a rounded/paraphrased figure that's close to a real grounded price (not an exact quote)", () => {
    // Evidence gives $120; the model rounds to $125 summarizing across sources — a real,
    // reasonable estimate, not a fabrication, and should not be blanked out.
    const grounding = "nightly rate around $120 per room";
    expect(sanitizeAssistantContent("Hotels run about $125 a night.", new Set(), grounding)).toBe("Hotels run about $125 a night.");
  });

  it("still blanks a figure nowhere near any grounded price", () => {
    const grounding = "nightly rate around $120 per room";
    expect(sanitizeAssistantContent("Hotels run about $900 a night.", new Set(), grounding)).toContain("an amount I can't verify here");
  });

  it("does not leave a dangling number when only the front of a range is unverifiable", () => {
    // The whole "$40-60" range must be treated (and replaced) as one unit — see the regex
    // comment above MONEY_PATTERN for why matching only "$40" leaves a stray "-60" behind.
    const out = sanitizeAssistantContent("Budget $40-60 per day.", new Set(), GROUNDING);
    expect(out).not.toMatch(/-\s*60/);
    expect(out).toBe("Budget an amount I can't verify here per day.");
  });

  it("does not leave a dangling country-code letter prefix in front of the replacement phrase", () => {
    // Live-caught: "CA$X to CA$Y" (an Uber-fare answer) rendered as "CAan amount I can't verify
    // here to CAan amount I can't verify here" — the match started at the `$`, leaving "CA" as
    // untouched literal text right before the fallback phrase.
    const out = sanitizeAssistantContent("It typically averages around CA$15 to CA$25 for a standard ride.", new Set(), GROUNDING);
    expect(out).not.toContain("CAan amount");
    expect(out).toBe("It typically averages around an amount I can't verify here to an amount I can't verify here for a standard ride.");
  });

  it("still keeps a country-prefixed amount that IS backed by the evidence", () => {
    const grounding = "typical fare CA$20";
    expect(sanitizeAssistantContent("It costs about CA$20.", new Set(), grounding)).toBe("It costs about CA$20.");
  });
});

describe("stripReasoning — scratchpad leak attempts", () => {
  it("keeps only the last final channel across repeated markers", () => {
    const t = "<|channel|>analysis<|message|>plan A<|channel|>final<|message|>first<|channel|>final<|message|>SECOND";
    expect(stripReasoning(t)).toBe("SECOND");
  });

  it("removes a well-formed <think> block regardless of case and whitespace", () => {
    expect(stripReasoning("<THINK>\n secret plan \n</THINK>\nThe answer.")).toBe("The answer.");
  });

  it("does not leak an UNCLOSED think block that is the whole reply", () => {
    // FINDING candidate: an unclosed block is left verbatim -> the scratchpad becomes the reply.
    const out = stripReasoning("<think>the user must not see this internal chain of thought");
    expect(out).not.toContain("must not see this");
  });

  it("strips nested think blocks completely, not just the outer close", () => {
    const out = stripReasoning("<think>outer <think>inner secret</think> outer tail</think>Answer.");
    expect(out).toBe("Answer.");
  });

  it("still leaves a literal '<think>' that appears mid-prose (not a real reasoning block)", () => {
    const out = stripReasoning("I <think> the metro is faster than a taxi here.");
    expect(out).toBe("I <think> the metro is faster than a taxi here.");
  });
});

describe("createReasoningGate — streaming leak attempts", () => {
  const run = (deltas: string[]) => {
    const gate = createReasoningGate();
    return deltas.map((d) => gate(d)).join("");
  };

  it("holds harmony analysis and releases only the final channel", () => {
    expect(run(["<|channel|>analysis<|message|>secret ", "rationale<|end|>", "<|channel|>final<|message|>Answer ", "here."])).toBe("Answer here.");
  });

  it("streams a plain model through untouched even when it opens with an angle bracket", () => {
    expect(run(["<3 ", "Lisbon is great"])).toBe("<3 Lisbon is great");
  });

  it("never emits analysis text when the final marker never arrives", () => {
    // The gate holds forever; it must emit "" rather than dumping the buffer at the end.
    expect(run(["<|channel|>analysis<|message|>internal ", "only, no final marker ever comes"])).toBe("");
  });

  it("does not leak a <think> that stays open for the whole stream", () => {
    expect(run(["<think>chain ", "of thought ", "with no close"])).toBe("");
  });

  it("classifies as reasoning even if the opening tag is split across many tiny deltas", () => {
    expect(run(["<", "th", "in", "k", ">", "secret", "</think>", "Answer."])).toBe("Answer.");
  });

  it("does not blank a figure the traveller typed themselves", () => {
    const out = sanitizeAssistantContent("Got it: CA$80 per person per day for a dorm bed.", new Set(), "{}", "any dorms under 80?");
    expect(out).toBe("Got it: CA$80 per person per day for a dorm bed.");
  });
  it("still blanks a figure nobody supplied", () => {
    expect(sanitizeAssistantContent("Dorms cost CA$400.", new Set(), "{}", "any dorms under 80?")).toContain("an amount I can't verify here");
  });
});
