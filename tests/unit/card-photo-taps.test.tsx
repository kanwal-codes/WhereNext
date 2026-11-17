// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { StayResultCard } from "../../features/stays/ui/StayResultCard";
import { MyStayCard } from "../../features/stays/ui/MyStayCard";

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
});
afterEach(cleanup);

/** The rule for every card with a photo: tapping the photo does what tapping the card does. A photo that is drawn above the card's open link must hand the tap down. */
describe("tapping a card's photo", () => {
  it("opens a hotel result: the phone card's photo does not take the tap", () => {
    const { container } = render(<StayResultCard stay={{ hotelId: "h", name: "Park Inn", thumbnail: "/p.jpg", stars: 3, rating: 6.6, nightlyAmount: 94, currency: "CAD" }} href="/trips/t/stay/h" onOpen={() => {}} phoneRow />);
    const photo = container.querySelector('[class*="aspect-[16/10]"]') as HTMLElement;
    expect(photo.className).toContain("pointer-events-none");
    expect(container.querySelector('a[aria-label="Open Park Inn"], button[aria-label="Open Park Inn"]')).toBeTruthy();
  });

  it("opens the booked stay: its photo has its own link to the stay", () => {
    const { container } = render(<MyStayCard stay={{ id: "s", name: "Bakal Tulum", address: null, note: null, refundable: false, thumbnail: "/p.jpg", badge: "Your stay", checkin: null, checkout: null, nights: null, total: null, perNight: null, href: "/trips/t/stay/s" }} />);
    const links = [...container.querySelectorAll('a[href="/trips/t/stay/s"]')];
    expect(links.length).toBe(2);
    expect(links.some((a) => a.getAttribute("aria-hidden") === "true" && a.className.includes("absolute inset-0"))).toBe(true);
  });
});
