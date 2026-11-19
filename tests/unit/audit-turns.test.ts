import { describe, expect, it } from "vitest";
import { allowedNumbers, auditReply, layoutAndEnglish, moneyIn } from "../../scripts/audit-turns";

describe("reply audit", () => {
  it("reads money in the shapes a reply writes it", () => {
    expect(moneyIn("From CA$1,129 up to 1,414 CAD, about $40.50 a day")).toEqual(["1129", "1414", "40.5"]);
  });

  it("allows a number the evidence, the traveller, a sum or a difference gives, and nothing else", () => {
    const ok = allowedNumbers("fares 926 CAD and 1,414 CAD; budget 800");
    expect(ok.has("926") && ok.has("800")).toBe(true);
    expect(ok.has("2340")).toBe(true); // 926 + 1,414
    expect(ok.has("488")).toBe(true); // 1,414 - 926
    expect(ok.has("9900")).toBe(false);
  });

  it("flags a claim to have booked, and an invented price, but not a grounded one", () => {
    const base = { prompt: "flights", history: [], systemPrompt: "Air Canada 1,846 CAD", evidence: undefined };
    expect(auditReply({ ...base, reply: "I've booked the 1,846 CAD fare for you." }).map((f) => f.check)).toContain("truth:claims-booking");
    expect(auditReply({ ...base, reply: "The fare is 1,846 CAD." })).toEqual([]);
    expect(auditReply({ ...base, reply: "It should be about 3,200 CAD." }).map((f) => f.check)).toContain("truth:ungrounded-price");
  });

  it("finds layout and English slips, and leaves a street abbreviation and French spacing alone", () => {
    expect(layoutAndEnglish("The **cheapest is fine.").map((f) => f.check)).toContain("layout:unbalanced-bold");
    expect(layoutAndEnglish("Take the the metro.").map((f) => f.check)).toContain("english:repeated-word");
    expect(layoutAndEnglish("i think this works.").map((f) => f.check)).toContain("english:lowercase-i");
    expect(layoutAndEnglish("Try **R. dos Sapateiros** for dinner.")).toEqual([]);
    expect(layoutAndEnglish("Que faire à Lisbonne un dimanche pluvieux ?")).toEqual([]);
  });
});
