import { describe, expect, it } from "vitest";
import { simplifyPath } from "@/lib/application/route-path";

describe("simplifyPath", () => {
  it("keeps short paths and rounds them", () => {
    expect(simplifyPath([[1.123456, 2.123456], [3, 4]])).toEqual([[1.12346, 2.12346], [3, 4]]);
  });
  it("thins a long path but keeps both ends", () => {
    const long = Array.from({ length: 500 }, (_, i) => [i, i] as [number, number]);
    const out = simplifyPath(long, 60)!;
    expect(out).toHaveLength(60);
    expect(out[0]).toEqual([0, 0]);
    expect(out[59]).toEqual([499, 499]);
  });
  it("returns nothing for fewer than two points", () => {
    expect(simplifyPath([[1, 1]])).toBeUndefined();
    expect(simplifyPath(undefined)).toBeUndefined();
  });
});
