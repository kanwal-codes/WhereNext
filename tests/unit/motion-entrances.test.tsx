// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the app's small motion wrappers (entrances, press feedback, crossfades, the blur-in image): what they
 * hand the animation library in each situation (a hidden tab, reduced motion), and that they never change element type.
 * The library is faked down to plain elements that record the props they were given.
 */
type Any = Record<string, any>;
let reduce = false;
let seen: Any[] = [];

vi.mock("motion/react", () => {
  const make = (tag: string) =>
    React.forwardRef<HTMLElement, Any>(function Fake(props, ref) {
      seen.push({ tag, ...props });
      const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, drag, ...rest } = props;
      return React.createElement(tag, { ref, "data-tag": tag, ...rest });
    });
  return {
    AnimatePresence: ({ children, mode, initial }: Any) => <div data-presence data-mode={mode} data-initial={String(initial)}>{children}</div>,
    useReducedMotion: () => reduce,
    useDragControls: () => ({ start: () => {} }),
    motion: { div: make("div"), span: make("span") },
  };
});

import { BlurImage, ContentSwap, Enter, Pressable, Reveal, Stagger, StaggerItem, Tactile, WordReveal, ease, motionTokens, useAnimateIn } from "../../components/motion-primitives";

const last = (tag?: string) => [...seen].reverse().find((p) => !tag || p.tag === tag)!;
let hidden = false;

beforeEach(() => {
  reduce = false; hidden = false; seen = [];
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});
afterEach(cleanup);

describe("tokens", () => {
  it("shares one easing curve and a small vocabulary of motions", () => {
    expect(ease).toEqual([0.22, 1, 0.36, 1]);
    expect(motionTokens.fast).toEqual({ duration: 0.16, ease });
    expect(motionTokens.swap).toEqual({ duration: 0.24, ease });
    expect(motionTokens.drawer).toEqual({ duration: 0.36, ease });
    expect(motionTokens.panelSpring).toEqual({ type: "spring", stiffness: 260, damping: 30, mass: 0.85 });
    expect(motionTokens.standard).toEqual({ type: "spring", stiffness: 260, damping: 28, mass: 0.9 });
    expect(motionTokens.lift).toEqual({ type: "spring", stiffness: 420, damping: 34 });
  });
});

describe("useAnimateIn", () => {
  function Probe() { return <p>{String(useAnimateIn())}</p>; }

  it("is on in a visible tab", () => {
    render(<Probe />);
    expect(screen.getByText("true")).toBeTruthy();
  });

  it("is off in a hidden tab, so content simply appears", () => {
    hidden = true;
    render(<Probe />);
    expect(screen.getByText("false")).toBeTruthy();
  });

  it("is off for someone who prefers reduced motion", () => {
    reduce = true;
    render(<Probe />);
    expect(screen.getByText("false")).toBeTruthy();
  });

  it("turns on when the tab becomes visible", () => {
    hidden = true;
    render(<Probe />);
    expect(screen.getByText("false")).toBeTruthy();
    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByText("true")).toBeTruthy();
  });
});

describe("Reveal", () => {
  it("rises and fades in, by the distance and after the delay it is given", () => {
    render(<Reveal y={20} delay={0.3} className="c"><p>hello</p></Reveal>);
    const p = last("div");
    expect(p.initial).toEqual({ opacity: 0, y: 20 });
    expect(p.animate).toEqual({ opacity: 1, y: 0 });
    expect(p.transition).toEqual({ duration: 0.5, ease, delay: 0.3 });
    expect(p.className).toBe("c");
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("rises 14px by default", () => {
    render(<Reveal><p>x</p></Reveal>);
    expect(last("div").initial).toEqual({ opacity: 0, y: 14 });
  });

  it("settles in place when it should not animate, and is still the same kind of element", () => {
    hidden = true;
    render(<Reveal><p>x</p></Reveal>);
    expect(last("div").initial).toBe(false);
    expect(document.querySelector('[data-tag="div"]')).toBeTruthy();
  });
});

describe("Stagger and StaggerItem", () => {
  it("staggers its children by the gap and delay it is given", () => {
    render(<Stagger gap={0.1} delay={0.4} className="s"><StaggerItem>a</StaggerItem></Stagger>);
    const parent = seen.find((p) => p.variants?.shown?.transition?.staggerChildren !== undefined)!;
    expect(parent.initial).toBe("hidden");
    expect(parent.animate).toBe("shown");
    expect(parent.variants.shown.transition).toEqual({ staggerChildren: 0.1, delayChildren: 0.4 });
    expect(parent.className).toBe("s");
  });

  it("staggers by 0.06s by default and does not animate when it should not", () => {
    hidden = true;
    render(<Stagger><StaggerItem>a</StaggerItem></Stagger>);
    const parent = seen.find((p) => p.variants?.shown?.transition?.staggerChildren !== undefined)!;
    expect(parent.variants.shown.transition).toEqual({ staggerChildren: 0.06, delayChildren: 0 });
    expect(parent.initial).toBe(false);
  });

  it("gives each item the rise-and-fade variants and passes the rest through", () => {
    render(<StaggerItem className="i" data-x="1">item</StaggerItem>);
    const item = last("div");
    expect(item.variants.hidden).toEqual({ opacity: 0, y: 16 });
    expect(item.variants.shown).toEqual({ opacity: 1, y: 0, transition: { duration: 0.45, ease } });
    expect(item.className).toBe("i");
    expect(item["data-x"]).toBe("1");
    expect("initial" in item).toBe(false);
  });
});

describe("Enter", () => {
  it("rises and fades in, with a swap-speed transition", () => {
    render(<Enter y={6}>x</Enter>);
    const p = last("div");
    expect(p.initial).toEqual({ opacity: 0, y: 6 });
    expect(p.transition).toEqual({ ...motionTokens.swap, delay: 0 });
  });

  it("delays siblings by 60ms each, at most six", () => {
    render(<><Enter index={2}>a</Enter><Enter index={6}>b</Enter><Enter index={40}>c</Enter></>);
    const delays = seen.filter((p) => p.tag === "div").map((p) => p.transition.delay);
    expect(delays[0]).toBeCloseTo(0.12, 5);
    expect(delays[1]).toBeCloseTo(0.36, 5);
    expect(delays[2]).toBeCloseTo(0.36, 5);
  });

  it("settles in place for restored content and for reduced motion", () => {
    render(<Enter live={false}>x</Enter>);
    expect(last("div").initial).toBe(false);
    cleanup();
    reduce = true;
    render(<Enter>x</Enter>);
    expect(last("div").initial).toBe(false);
  });
});

describe("WordReveal", () => {
  it("makes a heading of the text, one rising span per word", () => {
    render(<WordReveal text="Where next today" className="h" />);
    const h = screen.getByRole("heading", { level: 1 });
    expect(h.className).toBe("h");
    expect(h.textContent?.replace(/\s+/g, " ").trim()).toBe("Where next today");
    expect(document.querySelectorAll(".overflow-hidden")).toHaveLength(3);
    const parent = seen.find((p) => p.variants?.shown?.transition?.staggerChildren === 0.055)!;
    expect(parent.variants.shown.transition).toEqual({ staggerChildren: 0.055, delayChildren: 0 });
  });

  it("starts after the delay and can be another tag", () => {
    render(<WordReveal text="Hi" delay={0.5} as="h2" />);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    const parent = seen.find((p) => p.variants?.shown?.transition?.staggerChildren === 0.055)!;
    expect(parent.variants.shown.transition.delayChildren).toBe(0.5);
  });

  it("is plain text when it should not animate", () => {
    hidden = true;
    render(<WordReveal text="Where next" />);
    expect(screen.getByRole("heading").textContent).toBe("Where next");
    expect(document.querySelectorAll(".overflow-hidden")).toHaveLength(0);
  });

  it("keeps repeated words apart", () => {
    render(<WordReveal text="go go go" />);
    expect(document.querySelectorAll(".overflow-hidden")).toHaveLength(3);
  });
});

describe("Tactile", () => {
  it("lifts on hover and squeezes on press", () => {
    render(<Tactile lift={4} className="t">x</Tactile>);
    const p = last("div");
    expect(p.whileHover).toEqual({ y: -4 });
    expect(p.whileTap).toEqual({ scale: 0.985 });
    expect(p.transition).toEqual(motionTokens.lift);
    expect(p.className).toBe("t");
  });

  it("lifts 2px by default, and lets the caller's own props through", () => {
    render(<Tactile data-id="k">x</Tactile>);
    expect(last("div").whileHover).toEqual({ y: -2 });
    expect(last("div")["data-id"]).toBe("k");
  });

  it("does nothing with reduced motion", () => {
    reduce = true;
    render(<Tactile>x</Tactile>);
    const p = last("div");
    expect(p.whileHover).toBeUndefined();
    expect(p.whileTap).toBeUndefined();
  });
});

describe("Pressable", () => {
  it("is an inline span that lifts a hair and squeezes on press", () => {
    render(<Pressable className="p">x</Pressable>);
    const p = last("span");
    expect(p.className).toBe("inline-flex p");
    expect(p.whileHover).toEqual({ y: -1 });
    expect(p.whileTap).toEqual({ scale: 0.98 });
    expect(p.transition).toEqual(motionTokens.fast);
  });

  it("does nothing with reduced motion", () => {
    reduce = true;
    render(<Pressable>x</Pressable>);
    expect(last("span").whileHover).toBeUndefined();
    expect(last("span").whileTap).toBeUndefined();
  });
});

describe("ContentSwap", () => {
  it("crossfades one keyed view into the next, waiting for the old one to leave", () => {
    render(<ContentSwap swapKey="a" className="c"><p>view</p></ContentSwap>);
    const presence = document.querySelector("[data-presence]")!;
    expect(presence.getAttribute("data-mode")).toBe("wait");
    expect(presence.getAttribute("data-initial")).toBe("false");
    const p = last("div");
    expect(p.initial).toEqual({ opacity: 0, x: 8 });
    expect(p.exit).toEqual({ opacity: 0, x: -6 });
    expect(p.transition).toEqual(motionTokens.swap);
    expect(p.className).toBe("c");
  });

  it("is instant with reduced motion", () => {
    reduce = true;
    render(<ContentSwap swapKey="a"><p>view</p></ContentSwap>);
    const p = last("div");
    expect(p.initial).toBe(false);
    expect(p.exit).toBeUndefined();
    expect(p.transition).toEqual({ duration: 0 });
  });
});

describe("BlurImage", () => {
  it("starts faint and slightly large, and settles when the image loads", () => {
    render(<BlurImage src="https://example.com/a.jpg" alt="A place" className="x" />);
    const img = screen.getByAltText("A place");
    expect(img.className).toContain("opacity-0");
    expect(img.className).toContain("scale-[1.02]");
    expect(img.className).toContain("x");
    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
    expect(img.className).toContain("scale-100");
  });

  it("loads lazily and decodes off the main thread", () => {
    render(<BlurImage src="https://example.com/a.jpg" alt="A" />);
    expect(screen.getByAltText("A").getAttribute("loading")).toBe("lazy");
    expect(screen.getByAltText("A").getAttribute("decoding")).toBe("async");
  });

  it("shows an image that was already cached at once, since its load event will not come again", () => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    render(<BlurImage src="https://example.com/a.jpg" alt="Cached" />);
    expect(screen.getByAltText("Cached").className).toContain("opacity-100");
    delete (HTMLImageElement.prototype as Any).complete;
  });

  it("passes other image attributes through", () => {
    render(<BlurImage src="https://example.com/a.jpg" alt="A" width={40} data-k="v" />);
    expect(screen.getByAltText("A").getAttribute("width")).toBe("40");
    expect(screen.getByAltText("A").getAttribute("data-k")).toBe("v");
  });
});
