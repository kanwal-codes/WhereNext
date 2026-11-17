// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-speech-input", () => ({ useSpeechInput: () => ({ supported: false, listening: false, toggle: vi.fn(), stop: vi.fn() }) }));
const { notifyToast } = vi.hoisted(() => ({ notifyToast: vi.fn() }));
vi.mock("@/lib/application/toast", () => ({ notifyToast }));

import { AiSearchBar } from "../../components/AiSearchBar";

let resolve: (() => void) | null = null;
beforeEach(() => {
  notifyToast.mockClear();
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

  it("empties the box once the ask is sent, as Roam's does", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    bar();
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(field, "Toronto to Ibiza by train{Enter}");
    expect(field.value).toBe("");
    resolve?.();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop searching" })).toBeNull());
    expect(field.value).toBe("");
  });

  it("brings the sentence back when the ask fails, or is stopped, so it is never lost", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => Promise.resolve(new Response("{}", { status: 500 })));
    bar();
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(field, "hotels in Lisbon{Enter}");
    await waitFor(() => expect(field.value).toBe("hotels in Lisbon"));
    await user.clear(field);
    await user.type(field, "somewhere{Enter}");
    await user.click(await screen.findByRole("button", { name: "Stop searching" }));
    await waitFor(() => expect(field.value).toBe("somewhere"));
  });

  it("applies what the words already fix at once, then the model's reading when it arrives", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onDirective = vi.fn();
    render(<AiSearchBar variant="plain" tripId="t1" scope="stays" placeholder="Try it" onDirective={onDirective} readNow={() => ({ priceMin: 150, priceMax: 200 })} />);
    await user.type(screen.getByRole("textbox"), "hotels 150-200{Enter}");
    expect(onDirective).toHaveBeenCalledTimes(1);
    expect(onDirective).toHaveBeenCalledWith({ priceMin: 150, priceMax: 200 }, "hotels 150-200");
    resolve?.();
    await waitFor(() => expect(onDirective).toHaveBeenCalledTimes(2));
  });

  it("says so, and gives the sentence back, when nothing in it could be turned into a search", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ directive: { interpretation: "Something nice" } }), { status: 200 })));
    render(<AiSearchBar variant="plain" tripId="t1" scope="stays" placeholder="Try it" onDirective={vi.fn()} />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(field, "something nice{Enter}");
    await waitFor(() => expect(notifyToast).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t find anything to change.*dates, a price, stars or an area/), "info"));
    await waitFor(() => expect(field.value).toBe("something nice"));
  });

  it("says what went through and what did not when the model could not be reached for part of a sentence", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onDirective = vi.fn();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ directive: { priceMax: 200, unread: true } }), { status: 200 })));
    render(<AiSearchBar variant="plain" tripId="t1" scope="stays" placeholder="Try it" onDirective={onDirective} readNow={() => ({ priceMax: 200 })} />);
    await user.type(screen.getByRole("textbox"), "hotels near the old town under 200{Enter}");
    await waitFor(() => expect(notifyToast).toHaveBeenCalledWith(expect.stringMatching(/Applied what I could read/), "error"));
  });
});
