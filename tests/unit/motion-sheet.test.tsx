// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the shared sheet (every drawer, dialog and bottom sheet in the app): how it opens and closes, the
 * modal focus plumbing (move in, Tab kept inside, Escape, focus handed back), the page scroll lock, and the drag-to-dismiss
 * thresholds. The animation library is faked down to plain elements that keep the props the sheet sets on them.
 */
type Any = Record<string, any>;
let reduce = false;
const dragStart = vi.fn();
let panelProps: Any = {};
let scrimProps: Any = {};

vi.mock("motion/react", () => {
  const strip = ({ initial, animate, exit, transition, drag, dragControls, dragListener, dragConstraints, dragElastic, dragDirectionLock, onDragEnd, layout, ...rest }: Any) => rest;
  return {
    AnimatePresence: ({ children }: Any) => <>{children}</>,
    useReducedMotion: () => reduce,
    useDragControls: () => ({ start: dragStart }),
    motion: {
      div: React.forwardRef<HTMLDivElement, Any>(function MotionDiv(props, ref) {
        if (props.role === "dialog") panelProps = props;
        else if (props.className?.includes("fixed inset-0")) scrimProps = props;
        return <div ref={ref} {...strip(props)} />;
      }),
    },
  };
});

import { Sheet } from "../../components/motion-primitives";

const frames = () => { vi.advanceTimersByTime(40); };
function Harness({ open = true, onClose = () => {}, side, initialFocus, label = "Test sheet", className }: Any) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button">opener</button>
      <Sheet open={open} onClose={onClose} side={side} ariaLabel={label} initialFocus={initialFocus ? ref : undefined} className={className}>
        <button type="button">first</button>
        <input aria-label="field" />
        <button type="button" ref={ref}>last</button>
      </Sheet>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] });
  reduce = false; panelProps = {}; scrimProps = {}; dragStart.mockClear();
  // jsdom has no layout, so every element reads as hidden to the focus trap; report anything attached as visible.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } });
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
  window.scrollTo = vi.fn() as never;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Sheet: opening and closing", () => {
  it("renders nothing while closed", () => {
    render(<Harness open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a labelled modal dialog", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Test sheet" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("closes from a click on the backdrop but not from one inside the panel", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText("first"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape while open, and not after", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Harness open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onClose, not the one it opened with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onClose={first} />);
    rerender(<Harness onClose={second} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not steal focus back when the parent re-renders", () => {
    const { rerender } = render(<Harness onClose={() => {}} />);
    act(frames);
    const field = screen.getByLabelText("field");
    field.focus();
    rerender(<Harness onClose={() => {}} />);
    act(frames);
    expect(document.activeElement).toBe(field);
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Sheet: focus", () => {
  it("moves focus to the first focusable thing after it has opened", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(document.body);
    act(frames);
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("moves it to the chosen element instead", () => {
    render(<Harness initialFocus />);
    act(frames);
    expect(document.activeElement).toBe(screen.getByText("last"));
  });

  it("falls back to the panel itself when it holds nothing focusable", () => {
    render(<Sheet open onClose={() => {}} ariaLabel="Empty"><p>just text</p></Sheet>);
    act(frames);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("hands focus back to what opened it", () => {
    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByText("opener");
    opener.focus();
    rerender(<Harness open />);
    act(frames);
    expect(document.activeElement).not.toBe(opener);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside: from the last element to the first, and Shift+Tab from the first to the last", () => {
    render(<Harness />);
    act(frames);
    const first = screen.getByText("first");
    const last = screen.getByText("last");
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("does not wrap Shift+Tab from the last element, nor Tab from the first", () => {
    render(<Harness />);
    act(frames);
    const last = screen.getByText("last");
    last.focus();
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(false);
    screen.getByText("first").focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(false);
  });

  it("skips anything that is not on screen when it picks where to start and where Tab wraps", () => {
    render(<Harness />);
    const first = screen.getByText("first");
    Object.defineProperty(first, "offsetParent", { configurable: true, get: () => null });
    act(frames);
    expect(document.activeElement).toBe(screen.getByLabelText("field"));
    screen.getByText("last").focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(document.activeElement).toBe(screen.getByLabelText("field"));
  });

  it("leaves Tab alone in the middle of the dialog", () => {
    render(<Harness />);
    act(frames);
    screen.getByLabelText("field").focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("Sheet: the page behind it", () => {
  it("locks scrolling on the body and the page root while open, and restores them", () => {
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "scroll";
    const { rerender } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    rerender(<Harness open={false} />);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.documentElement.style.overflow).toBe("scroll");
  });

  it("keeps a classic scrollbar's width so the page does not jump", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1009 });
    const { rerender } = render(<Harness />);
    expect(document.documentElement.style.paddingRight).toBe("15px");
    rerender(<Harness open={false} />);
    expect(document.documentElement.style.paddingRight).toBe("");
  });

  it("adds no padding when the scrollbar floats", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1024 });
    render(<Harness />);
    expect(document.documentElement.style.paddingRight).toBe("");
  });

  it("does not pin the body on a desktop browser", () => {
    render(<Harness />);
    expect(document.body.style.position).toBe("");
  });

  it("pins the body on iPhone and puts the scroll position back", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
    const { rerender } = render(<Harness />);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-420px");
    expect(document.body.style.width).toBe("100%");
    rerender(<Harness open={false} />);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it("pins the body on an iPad that reports itself as a Mac", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    render(<Harness />);
    expect(document.body.style.position).toBe("fixed");
  });

  it("does not pin a Mac with a single touch point", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 1 });
    render(<Harness />);
    expect(document.body.style.position).toBe("");
  });

  it("does not pin a Mac with no touch screen", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
    render(<Harness />);
    expect(document.body.style.position).toBe("");
  });
});

describe("Sheet: where it sits", () => {
  it("anchors a bottom sheet low with a drag handle", () => {
    render(<Harness side="bottom" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-t-3xl");
    expect(dialog.parentElement!.className).toContain("items-end");
    expect(dialog.querySelector("[aria-hidden]")).toBeTruthy();
  });

  it("is a bottom sheet by default", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog").className).toContain("rounded-t-3xl");
  });

  it("puts a right or left sheet against its edge, with no handle", () => {
    const { unmount } = render(<Harness side="right" />);
    expect(screen.getByRole("dialog").parentElement!.className).toContain("justify-end");
    expect(screen.getByRole("dialog").querySelector("[aria-hidden]")).toBeNull();
    unmount();
    render(<Harness side="left" />);
    expect(screen.getByRole("dialog").parentElement!.className).toContain("justify-start");
  });

  it("centres a dialog box, sharp-text style (no promoted layer)", () => {
    render(<Harness side="center" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement!.className).toContain("items-center justify-center p-4");
    expect(dialog.className).toContain("max-w-sm rounded-3xl");
    expect(dialog.className).not.toContain("will-change-transform");
  });

  it("promotes the sliding sheets to their own layer", () => {
    render(<Harness side="right" />);
    expect(screen.getByRole("dialog").className).toContain("will-change-transform");
  });

  it("lets the caller add classes", () => {
    render(<Harness className="h-[92dvh]" />);
    expect(screen.getByRole("dialog").className).toContain("h-[92dvh]");
  });
});

describe("Sheet: dragging it away", () => {
  it("lets a bottom sheet be dragged down, closed past 90px or a fast flick", () => {
    const onClose = vi.fn();
    render(<Harness side="bottom" onClose={onClose} />);
    expect(panelProps.drag).toBe("y");
    expect(panelProps.dragListener).toBe(false);
    panelProps.onDragEnd(null, { offset: { y: 90 }, velocity: { y: 0 } });
    panelProps.onDragEnd(null, { offset: { y: 10 }, velocity: { y: 600 } });
    expect(onClose).not.toHaveBeenCalled();
    panelProps.onDragEnd(null, { offset: { y: 91 }, velocity: { y: 0 } });
    expect(onClose).toHaveBeenCalledTimes(1);
    panelProps.onDragEnd(null, { offset: { y: 10 }, velocity: { y: 601 } });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("lets a left sheet be pushed back, closed past 70px or a fast flick", () => {
    const onClose = vi.fn();
    render(<Harness side="left" onClose={onClose} />);
    expect(panelProps.drag).toBe("x");
    expect(panelProps.dragDirectionLock).toBe(true);
    panelProps.onDragEnd(null, { offset: { x: -70 }, velocity: { x: 0 } });
    panelProps.onDragEnd(null, { offset: { x: -10 }, velocity: { x: -500 } });
    panelProps.onDragEnd(null, { offset: { x: 90 }, velocity: { x: 900 } });
    expect(onClose).not.toHaveBeenCalled();
    panelProps.onDragEnd(null, { offset: { x: -71 }, velocity: { x: 0 } });
    expect(onClose).toHaveBeenCalledTimes(1);
    panelProps.onDragEnd(null, { offset: { x: -10 }, velocity: { x: -501 } });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("cannot drag a right sheet or a centred dialog away", () => {
    const { unmount } = render(<Harness side="right" />);
    expect(panelProps.drag).toBeUndefined();
    unmount();
    render(<Harness side="center" />);
    expect(panelProps.drag).toBeUndefined();
  });

  it("starts the drag from the handle", () => {
    render(<Harness side="bottom" />);
    fireEvent.pointerDown(screen.getByRole("dialog").querySelector("[aria-hidden]")!);
    expect(dragStart).toHaveBeenCalledTimes(1);
  });

  it("does not drag at all when the person asks for reduced motion", () => {
    reduce = true;
    render(<Harness side="bottom" />);
    expect(panelProps.drag).toBeUndefined();
    expect(panelProps.initial).toBe(false);
    fireEvent.pointerDown(screen.getByRole("dialog").querySelector("[aria-hidden]")!);
    expect(dragStart).not.toHaveBeenCalled();
  });

  it("does not drag a left sheet with reduced motion either", () => {
    reduce = true;
    render(<Harness side="left" />);
    expect(panelProps.drag).toBeUndefined();
  });
});

describe("Sheet: the way it moves", () => {
  it("slides in from its own edge", () => {
    for (const [side, closed] of [["bottom", { y: "100%" }], ["right", { x: "100%" }], ["left", { x: "-100%" }], ["center", { opacity: 0, scale: 0.96 }]] as const) {
      const { unmount } = render(<Harness side={side} />);
      expect(panelProps.initial).toEqual(closed);
      expect(panelProps.exit).toMatchObject(closed);
      unmount();
    }
  });

  it("settles at once with reduced motion", () => {
    reduce = true;
    render(<Harness side="right" />);
    expect(panelProps.exit).toBeUndefined();
    expect(panelProps.transition).toEqual({ duration: 0 });
    expect(scrimProps.transition).toEqual({ duration: 0 });
  });

  it("makes the fading scrim click-through the moment it starts to leave", () => {
    render(<Harness />);
    expect(scrimProps.initial).toEqual({ opacity: 0, pointerEvents: "none" });
    expect(scrimProps.animate).toEqual({ opacity: 1, pointerEvents: "auto" });
    expect(scrimProps.exit).toMatchObject({ opacity: 0, pointerEvents: "none" });
  });
});
