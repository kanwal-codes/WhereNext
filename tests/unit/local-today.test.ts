import { describe, expect, it } from "vitest";
import { localToday } from "@/lib/local-today";

const at = (zone?: string) => localToday(new Headers(zone ? { "x-vercel-ip-timezone": zone } : {}), new Date("2026-11-26T02:30:00Z"));

describe("localToday", () => {
  it("is the visitor's own date, not UTC's", () => {
    expect(at("America/Toronto")).toBe("2026-11-25"); // 9:30 PM the evening before
    expect(at("Asia/Tokyo")).toBe("2026-11-26");
    expect(at("Pacific/Auckland")).toBe("2026-11-26");
  });
  it("falls back to the UTC date without a usable zone", () => {
    expect(at()).toBe("2026-11-26");
    expect(at("Not/AZone")).toBe("2026-11-26");
  });
  it("reads an encoded zone name", () => {
    expect(at("America%2FToronto")).toBe("2026-11-25");
  });
});
