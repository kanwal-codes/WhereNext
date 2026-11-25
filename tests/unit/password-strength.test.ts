import { describe, expect, it } from "vitest";
import { strengthOf } from "@/lib/password-strength";

describe("strengthOf", () => {
  it("scores nothing under 8 characters, however mixed", () => {
    expect(strengthOf("")).toBe(0);
    expect(strengthOf("A1!")).toBe(0);
    expect(strengthOf("A1!aaaa")).toBe(0);
  });
  it("counts length, capital, digit and symbol once each", () => {
    expect(strengthOf("aaaaaaaa")).toBe(1);
    expect(strengthOf("Aaaaaaaa")).toBe(2);
    expect(strengthOf("Aaaaaaa1")).toBe(3);
    expect(strengthOf("Aaaaaa1!")).toBe(4);
  });
});
