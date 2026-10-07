import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

// The matcher is a path-to-regexp pattern whose only special part is one regex group, so anchoring it is enough to try it.
const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("middleware matcher", () => {
  it("runs for pages and APIs, including the photo proxy", () => {
    for (const path of ["/", "/sign-in", "/trips/abc/chat", "/api/ai", "/api/trips/abc/places/google/photo"]) expect(matches(path), path).toBe(true);
  });

  it("skips pictures, icons and fonts, which have no session to read", () => {
    for (const path of ["/design/place-hotel.jpg", "/hero/01-aerial-beach.webp", "/icons/icon-192.png", "/anything/else.svg", "/fonts/a.woff2", "/favicon.ico", "/_next/static/chunks/a.js", "/_next/image"]) expect(matches(path), path).toBe(false);
  });
});
