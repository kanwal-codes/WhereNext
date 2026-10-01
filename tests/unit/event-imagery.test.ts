import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_IMAGE, eventFallbackImage } from "@/lib/event-imagery";

describe("eventFallbackImage", () => {
  it("picks a photo by event type", () => {
    expect(eventFallbackImage({ title: "SARASANDO by INALEAH - Indonesian Music Concert, Socials, & Snacks" })).toContain("concert-arena");
    expect(eventFallbackImage({ genre: "Music · Rock", title: "Arctic Monkeys" })).toContain("concert-arena");
    expect(eventFallbackImage({ title: "Pottery workshop for beginners" })).toContain("pottery-wheel");
    expect(eventFallbackImage({ title: "Borough Market street food tasting" })).toContain("cafe");
    expect(eventFallbackImage({ title: "Rooftop cocktails and karaoke" })).toContain("rooftop-lounge");
  });

  it("keeps the generic photo when the type is unknown or missing", () => {
    expect(eventFallbackImage({ title: "Chelsea v Arsenal" })).toBe(DEFAULT_EVENT_IMAGE);
    expect(eventFallbackImage({})).toBe(DEFAULT_EVENT_IMAGE);
  });
});
