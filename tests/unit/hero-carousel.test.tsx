// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "@/components/HeroCarousel";
import { HERO_SCENES } from "@/lib/hero-scenes";

vi.mock("motion/react", () => ({ useReducedMotion: () => false }));

const srcs = (c: HTMLElement) => [...c.querySelectorAll("img")].map((i) => i.getAttribute("src"));

describe("HeroCarousel loading", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("paints only the first photograph, then arms the next, never the last scene", () => {
    const { container } = render(<HeroCarousel />);
    expect(srcs(container)).toEqual([HERO_SCENES[0]!.src]);
    expect(container.querySelector("img")?.getAttribute("fetchpriority")).toBe("high");

    act(() => void vi.advanceTimersByTime(2500));
    expect(srcs(container)).toEqual([HERO_SCENES[0]!.src, HERO_SCENES[1]!.src]);
  });

  it("keeps the photograph it just left mounted while it fades out", () => {
    const { container } = render(<HeroCarousel />);
    act(() => void vi.advanceTimersByTime(7000));
    expect(srcs(container)).toEqual([HERO_SCENES[0]!.src, HERO_SCENES[1]!.src, HERO_SCENES[2]!.src]);
  });
});
