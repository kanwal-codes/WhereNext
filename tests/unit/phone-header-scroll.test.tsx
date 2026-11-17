// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { PhoneHeader } from "@/components/shell/PhoneHeader";

let frames: FrameRequestCallback[] = [];
const scrollTo = (y: number) => {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
  const due = frames; frames = [];
  act(() => { for (const cb of due) cb(0); });
};
const bar = () => document.querySelector("[data-trip-topbar]") as HTMLElement;
const show = () => render(<PhoneHeader pathname="/trips/t1/discover" tripId="t1" tripName="Ibiza trip" onMenu={() => undefined} />);

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", { value: 3000, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the phone top bar while scrolling", () => {
  it("keeps its translucent tint, shown, at the top of a page", () => {
    show();
    expect(bar().className).toContain("bg-background/95");
    expect(bar().className).not.toContain("-translate-y-full");
  });

  it("stays put near the top however you scroll, slides out while reading down, and returns on the way up", () => {
    show();
    for (const y of [40, 90, 130]) scrollTo(y);
    expect(bar().className).not.toContain("-translate-y-full"); // still inside the top zone
    for (const y of [180, 230, 280]) scrollTo(y);
    expect(bar().className).toContain("-translate-y-full");
    for (const y of [270, 255]) scrollTo(y);
    expect(bar().className).not.toContain("-translate-y-full");
  });

  it("returns when keyboard focus lands on it, so a hidden control can never be focused out of sight", () => {
    show();
    for (const y of [180, 230, 280]) scrollTo(y);
    expect(bar().className).toContain("-translate-y-full");
    act(() => screen.getByRole("button", { name: "Open trip menu" }).focus());
    expect(bar().className).not.toContain("-translate-y-full");
  });

  it("does not animate for people who asked for reduced motion", () => {
    show();
    expect(bar().className).toContain("motion-reduce:transition-none");
  });
});
