// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../features/conversation/domain/message";

const toast = vi.fn();
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("../../features/conversation/ui/AssistantMessage", () => ({ AssistantMessage: ({ content }: { content: string }) => <div>{content}</div> }));

import { ReplyTurn } from "../../features/conversation/ui/ConversationTurns";

const TRIP = "11111111-1111-4111-8111-111111111111";
const base: Message = { id: "22222222-2222-4222-8222-222222222222", role: "assistant", content: "Try the night market.", created_at: "2026-11-14T10:00:00.000Z" };

type Put = { messageId: string; rating: string | null; note?: string };
let puts: Put[];
let failNext: boolean;

/** The thread's state in miniature: the rating lives on the message, as in ConversationSurface. */
function Harness({ message = base, isLatest = true, streaming = false }: { message?: Message; isLatest?: boolean; streaming?: boolean }) {
  const [msg, setMsg] = useState(message);
  return (
    <ReplyTurn
      message={msg} isNew={false} streaming={streaming} live={false} isLatest={isLatest} dir={undefined} handlers={{ tripId: TRIP } as never} tripId={TRIP}
      onRate={(id, rating) => setMsg((m) => (m.id === id ? { ...m, rating } : m))}
    />
  );
}

beforeEach(() => {
  puts = [];
  failNext = false;
  toast.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    puts.push(JSON.parse(String(init?.body)));
    return failNext ? new Response("{}", { status: 503 }) : new Response("{}", { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const up = () => screen.getByRole("button", { name: "Helpful reply" });
const down = () => screen.getByRole("button", { name: "Not helpful" });

describe("reply feedback", () => {
  it("shows two named, keyboard-reachable thumbs in a labelled group, with 44px phone targets and the desktop size kept", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Rate this reply" })).toBeTruthy();
    expect(up().getAttribute("aria-pressed")).toBe("false");
    expect(down().tabIndex).toBe(0);
    // One shared control: 36px on the phone design (max-lg) and 32px from lg up, both with a hit area that reaches past the edges (48px and 44px).
    expect(up().className).toMatch(/max-lg:size-9/);
    expect(up().className).toMatch(/before:-inset-1\.5/);
    expect(up().className).toMatch(/\bsize-8\b/);
  });

  it("has no thumbs on a reply that is still streaming", () => {
    render(<Harness streaming />);
    expect(screen.queryByRole("button", { name: "Helpful reply" })).toBeNull();
  });

  it("starts lit from the rating the thread loaded", () => {
    render(<Harness message={{ ...base, rating: "down" }} />);
    expect(down().getAttribute("aria-pressed")).toBe("true");
  });

  it("rates up at once, changes to down, and clears on a second tap of the lit thumb", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(up());
    expect(up().getAttribute("aria-pressed")).toBe("true"); // optimistic: lit before the request settles
    await user.click(down());
    expect(up().getAttribute("aria-pressed")).toBe("false");
    expect(down().getAttribute("aria-pressed")).toBe("true");
    await user.click(down());
    expect(down().getAttribute("aria-pressed")).toBe("false");
    expect(puts.map((p) => p.rating)).toEqual(["up", "down", null]);
    expect(puts.every((p) => p.messageId === base.id)).toBe(true);
  });

  it("toggles from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    up().focus();
    await user.keyboard("{Enter}");
    expect(up().getAttribute("aria-pressed")).toBe("true");
    await user.keyboard(" ");
    expect(up().getAttribute("aria-pressed")).toBe("false");
  });

  it("puts the thumb back and says so when the save fails", async () => {
    const user = userEvent.setup();
    failNext = true;
    render(<Harness />);
    await user.click(up());
    await waitFor(() => expect(up().getAttribute("aria-pressed")).toBe("false"));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t save/), "error");
  });

  it("a thumbs-down opens an optional one-line note, capped at 280, sent with the same rating", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(down());
    const field = screen.getByRole("textbox", { name: /What was wrong/ }) as HTMLInputElement;
    expect(field.maxLength).toBe(280);
    expect(document.activeElement).toBe(field);
    const send = screen.getByRole("button", { name: "Send note" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // the rating alone is already saved; an empty note is not sent
    await user.type(field, "Suggested a place that is closed");
    await user.click(send);
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(puts.at(-1)).toEqual({ messageId: base.id, rating: "down", note: "Suggested a place that is closed" });
    expect(screen.getByRole("status").textContent).toMatch(/Thanks/);
    expect(down().getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape closes the note and a thumbs-up never shows one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(down());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(down()); // clear
    await user.click(up());
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps Copy beside the thumbs", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Copy reply" })).toBeTruthy();
  });
});
