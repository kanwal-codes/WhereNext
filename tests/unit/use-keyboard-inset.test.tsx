// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";

/** A visual viewport the test can resize, the way an on-screen keyboard does. */
function fakeViewport(height: number) {
  const listeners = new Set<() => void>();
  const vv = {
    height,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    resize(next: number) { vv.height = next; listeners.forEach((fn) => fn()); },
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return vv;
}

afterEach(() => { document.documentElement.style.removeProperty("--vvh"); });

describe("useKeyboardInset", () => {
  it("is false until the visible height drops well below the window's, and sets --vvh while active", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    const vv = fakeViewport(800);
    const { result, unmount } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--vvh")).toBe("800px");
    act(() => vv.resize(470));
    expect(result.current).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--vvh")).toBe("470px");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--vvh")).toBe("");
  });

  it("does nothing while the sheet is closed", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    fakeViewport(400);
    const { result } = renderHook(() => useKeyboardInset(false));
    expect(result.current).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--vvh")).toBe("");
  });
});
