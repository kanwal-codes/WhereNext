// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-speech-input", () => ({ useSpeechInput: () => ({ supported: false, listening: false, toggle: vi.fn(), stop: vi.fn() }) }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: vi.fn() }));

import { AiSearchBar } from "../../components/AiSearchBar";

let resolve: (() => void) | null = null;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  resolve = null;
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((done) => {
    resolve = () => done(new Response(JSON.stringify({ directive: { from: "A", to: "B" } }), { status: 200 }));
    init.signal?.addEventListener("abort", () => done(new Response("{}", { status: 499 })));
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bar = (onDirective = vi.fn()) => { render(<AiSearchBar variant="plain" tripId="t1" scope="getting-around" placeholder="Try it" onDirective={onDirective} />); return onDirective; };

describe("AiSearchBar, plain (the Roam message box)", () => {
  it("is a growing text box whose send is off until there is text, and Enter sends", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onDirective = bar();
    const field = screen.getByRole("textbox", { name: "Ask for what you want" });
    expect(field.tagName).toBe("TEXTAREA");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(field, "Toronto to Ibiza by train{Enter}");
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ scope: "getting-around", query: "Toronto to Ibiza by train" });
    resolve?.();
    await waitFor(() => expect(onDirective).toHaveBeenCalledWith({ from: "A", to: "B" }, "Toronto to Ibiza by train"));
  });

  it("turns the send into a stop while it waits, and stopping drops the search quietly", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onDirective = bar();
    await user.type(screen.getByRole("textbox"), "somewhere");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Stop searching" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop searching" })).toBeNull());
    expect(onDirective).not.toHaveBeenCalled();
  });
});
