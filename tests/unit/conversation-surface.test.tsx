// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../features/conversation/domain/message";

/**
 * Characterization tests for the Roam chat screen: what a traveller sees and which requests go out, with the network
 * (including the streamed reply) faked. They pin today's behaviour so the screen can be reorganised without changing it.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";

const toast = vi.fn();
const openGate = vi.fn();
let guestState = { guest: false };
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest: guestState.guest, openGate }) }));
vi.mock("@/features/identity/ui/GuestSavePrompt", () => ({ GuestSavePrompt: ({ exhausted }: { exhausted: boolean }) => <div>SAVE PROMPT {exhausted ? "exhausted" : "early"}</div> }));
vi.mock("../../features/conversation/ui/AssistantMessage", () => ({
  AssistantMessage: ({ content, streaming }: { content: string; streaming?: boolean }) => <div data-testid="assistant" data-streaming={streaming ? "yes" : "no"}>{content}</div>,
}));

import { ConversationSurface } from "../../features/conversation/ui/ConversationSurface";

const at = (n: number) => new Date(Date.UTC(2026, 9, 10, 10, n)).toISOString();
const user = (id: string, content: string, over: Partial<Message> = {}): Message => ({ id, role: "user", content, created_at: at(0), ...over });
const roam = (id: string, content: string, over: Partial<Message> = {}): Message => ({ id, role: "assistant", content, created_at: at(1), ...over });

type Call = { method: string; url: string; body?: Record<string, unknown> };
type Reply = { status?: number; json?: unknown; sse?: string; hang?: boolean };
type Handler = (call: Call, signal?: AbortSignal | null) => Reply | undefined | Promise<Reply | undefined>;

let calls: Call[];
let handlers: Handler[];
let thread: Message[];

const sse = (text: string, meta: Record<string, unknown> = { surface: "explore", blocks: [], suggestedFollowups: [] }) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ meta, content: text })}\n\ndata: [DONE]\n\n`;

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const out = await h(call, init?.signal);
      if (!out) continue;
      if (out.hang) {
        const stream = new ReadableStream({ start(controller) { init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError"))); controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`)); } });
        return new Response(stream, { status: 200 });
      }
      if (out.sse !== undefined) return new Response(out.sse, { status: out.status ?? 200 });
      return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
    }
    if (call.method === "GET" && call.url.endsWith("/conversation")) return new Response(JSON.stringify({ messages: thread }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }));
}

const aiCalls = () => calls.filter((c) => c.method === "POST" && c.url === "/api/ai");
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const replyTo = (text: string): Handler => (c) => (c.url === "/api/ai" ? { sse: sse(text) } : undefined);

async function open(props: Partial<React.ComponentProps<typeof ConversationSurface>> = {}) {
  const u = userEvent.setup({ pointerEventsCheck: 0 });
  const utils = render(<ConversationSurface tripId={TRIP} {...props} />);
  await waitFor(() => expect(box().disabled).toBe(false));
  return { u, ...utils };
}

beforeEach(() => {
  sessionStorage.clear();
  toast.mockClear();
  openGate.mockClear();
  guestState = { guest: false };
  thread = [roam("greeting", "Hi, I'm Roam.")];
  handlers = [];
  installFetch();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("ConversationSurface: opening", () => {
  it("shows a loading composer, then the saved thread", async () => {
    thread = [user("1", "Plan day one"), roam("2", "Start at the market.")];
    render(<ConversationSurface tripId={TRIP} />);
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toBe("Loading…");
    await screen.findByText("Start at the market.");
    expect(screen.getByText("Plan day one")).toBeTruthy();
    expect(box().placeholder).toBe("Ask about your trip…");
    expect(calls.filter((c) => c.url === `/api/trips/${TRIP}/conversation`)).toHaveLength(1);
  });

  it("offers starters on an empty thread, and a starter fills the box", async () => {
    thread = [];
    const { u } = await open();
    await u.click(screen.getByRole("button", { name: "Plan my first day" }));
    expect(box().value).toBe("Plan my first day");
  });

  it("opens from a fresh session cache at once, without asking the server again", async () => {
    sessionStorage.setItem(`where-next:conversation:${TRIP}`, JSON.stringify({ savedAt: Date.now(), messages: [user("c1", "From cache")] }));
    await open();
    expect(screen.getByText("From cache")).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith("/conversation"))).toHaveLength(0);
  });

  it("shows a stale cache first, then reconciles with the server", async () => {
    sessionStorage.setItem(`where-next:conversation:${TRIP}`, JSON.stringify({ savedAt: Date.now() - 10 * 60_000, messages: [user("old", "Cached question")] }));
    thread = [user("old", "Cached question"), roam("new", "Fresh answer from the server")];
    await open();
    await screen.findByText("Fresh answer from the server");
    expect(calls.filter((c) => c.url.endsWith("/conversation"))).toHaveLength(1);
  });

  it("tells you when the thread could not be loaded, but still lets you type", async () => {
    handlers.push((c) => (c.url.endsWith("/conversation") ? { status: 500 } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    render(<ConversationSurface tripId={TRIP} />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t load the conversation — reload to try again.", "error"));
    await waitFor(() => expect(box().disabled).toBe(false));
    void u;
  });

  it("lays out the newest 30 turns and reveals earlier ones on request", async () => {
    thread = Array.from({ length: 40 }, (_, i) => (i % 2 ? roam(`r${i}`, `answer ${i}`) : user(`u${i}`, `question ${i}`)));
    const { u } = await open();
    expect(screen.queryByText("question 0")).toBeNull();
    expect(screen.getByText("answer 39")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(screen.getByText("question 0")).toBeTruthy();
  });

  it("fills the box from ?ask= once, and tidies the address", async () => {
    window.history.replaceState({}, "", `/trips/x/chat?ask=${encodeURIComponent("Is it safe at night?")}`);
    await open();
    await waitFor(() => expect(box().value).toBe("Is it safe at night?"));
    expect(window.location.search).toBe("");
  });

  it("flags a message Roam never answered, and sends it again under its original key", async () => {
    thread = [user("srv1", "Where to eat?", { idempotency_key: "user:abc-123", created_at: new Date(Date.now() - 5 * 60_000).toISOString() })];
    handlers.push(replyTo("Try the market."));
    const { u } = await open();
    expect(screen.getByText(/Roam didn’t get to answer this one/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(aiCalls()).toHaveLength(1));
    expect(aiCalls()[0].body).toMatchObject({ tripId: TRIP, messageIdempotencyKey: "abc-123", messages: [{ role: "user", content: "Where to eat?" }] });
  });
});

describe("ConversationSurface: asking", () => {
  it("sends the message, streams the reply, and clears the box", async () => {
    handlers.push(replyTo("Try the market."));
    const { u } = await open({ viewContext: "Time Out Market" });
    await u.type(box(), "Where to eat?");
    await u.keyboard("{Enter}");
    expect(box().value).toBe("");
    await screen.findByText("Try the market.");
    expect(screen.getByText("Where to eat?")).toBeTruthy();
    expect(aiCalls()).toHaveLength(1);
    const body = aiCalls()[0].body!;
    expect(body).toMatchObject({ tripId: TRIP, viewContext: "Time Out Market", messages: [{ role: "user", content: "Where to eat?" }] });
    expect(typeof body.messageIdempotencyKey).toBe("string");
    await waitFor(() => expect(screen.getAllByTestId("assistant").at(-1)!.getAttribute("data-streaming")).toBe("no"));
  });

  it("shows 'Sending…' on your message until the server has it, then not", async () => {
    let release!: () => void;
    handlers.push((c) => (c.url === "/api/ai" ? new Promise<Reply>((r) => { release = () => r({ sse: sse("Done.") }); }) : undefined));
    const { u } = await open();
    await u.type(box(), "Hello");
    await u.keyboard("{Enter}");
    expect(await screen.findByText("Sending…")).toBeTruthy();
    await act(async () => release());
    await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
    await screen.findByText("Done.");
  });

  it("ignores an empty message", async () => {
    const { u } = await open();
    await u.type(box(), "   ");
    await u.keyboard("{Enter}");
    expect(aiCalls()).toHaveLength(0);
  });

  it("puts your words back and offers Retry (same key) when the message could not be saved", async () => {
    let n = 0;
    handlers.push((c) => {
      if (c.url !== "/api/ai") return undefined;
      n += 1;
      return n === 1 ? { status: 503, json: { error: "down" } } : { sse: sse("Second time lucky.") };
    });
    const { u } = await open();
    await u.type(box(), "Find a hotel");
    await u.keyboard("{Enter}");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Your message didn’t send.", "error", expect.objectContaining({ label: "Retry" })));
    expect(box().value).toBe("Find a hotel");
    expect(screen.queryByText("Sending…")).toBeNull();
    const retry = toast.mock.calls.find((c) => c[0] === "Your message didn’t send.")![2] as { onClick: () => void };
    await act(async () => retry.onClick());
    await screen.findByText("Second time lucky.");
    expect(aiCalls()[0].body!.messageIdempotencyKey).toBe(aiCalls()[1].body!.messageIdempotencyKey);
  });

  it("keeps a saved message, and says Roam couldn't reply, when the answer fails", async () => {
    handlers.push((c) => (c.url === "/api/ai" ? { status: 500, json: { error: "boom", userSaved: true } } : undefined));
    const { u } = await open();
    await u.type(box(), "Plan a day");
    await u.keyboard("{Enter}");
    expect(await screen.findByText("Roam couldn’t reply")).toBeTruthy();
    expect(screen.getByText("Plan a day")).toBeTruthy();
    expect(toast).toHaveBeenCalledWith("Roam couldn’t reply — your message is saved.", "error", expect.objectContaining({ label: "Retry" }));
    expect(box().value).toBe("");
  });

  it("says Roam is busy on a 429 after the message was saved", async () => {
    handlers.push((c) => (c.url === "/api/ai" ? { status: 429, json: { error: "slow down", userSaved: true } } : undefined));
    const { u } = await open();
    await u.type(box(), "Again");
    await u.keyboard("{Enter}");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Roam is busy right now — your message is saved.", "error", expect.anything()));
  });

  it("queues a message typed while a reply is finishing, and sends it afterwards", async () => {
    let release!: () => void;
    let n = 0;
    handlers.push((c) => {
      if (c.url !== "/api/ai") return undefined;
      n += 1;
      return n === 1 ? new Promise<Reply>((r) => { release = () => r({ sse: sse("First answer.") }); }) : { sse: sse("Second answer.") };
    });
    const { u } = await open();
    await u.type(box(), "First");
    await u.keyboard("{Enter}");
    await u.type(box(), "Second");
    await u.keyboard("{Enter}");
    expect(await screen.findByText(/Next: “Second”/)).toBeTruthy();
    expect(box().value).toBe("");
    expect(aiCalls()).toHaveLength(1);
    await act(async () => release());
    await screen.findByText("Second answer.");
    expect(aiCalls()).toHaveLength(2);
    expect(aiCalls()[1].body).toMatchObject({ messages: [{ content: "Second" }] });
  });

  it("lets you cancel or edit a queued message", async () => {
    let release!: () => void;
    handlers.push((c) => (c.url === "/api/ai" ? new Promise<Reply>((r) => { release = () => r({ sse: sse("Done.") }); }) : undefined));
    const { u } = await open();
    await u.type(box(), "First");
    await u.keyboard("{Enter}");
    await u.type(box(), "Later");
    await u.keyboard("{Enter}");
    await u.click(await screen.findByRole("button", { name: "Edit" }));
    expect(box().value).toBe("Later");
    await u.keyboard("{Enter}");
    await u.click(await screen.findByRole("button", { name: "Cancel" }));
    await act(async () => release());
    await screen.findByText("Done.");
    expect(aiCalls()).toHaveLength(1);
  });

  it("stops a reply in progress and drops the empty answer", async () => {
    handlers.push((c) => (c.url === "/api/ai" ? { hang: true } : undefined));
    const { u } = await open();
    await u.type(box(), "Slow one");
    await u.keyboard("{Enter}");
    await screen.findByText("Slow one");
    const stop = await screen.findByRole("button", { name: /stop/i });
    await u.click(stop);
    await waitFor(() => expect(box().placeholder).toBe("Ask about your trip…"));
    expect(aiCalls()).toHaveLength(1);
  });
});

describe("ConversationSurface: guests", () => {
  it("closes the box and opens the save card when the free messages run out, giving the text back", async () => {
    guestState = { guest: true };
    handlers.push((c) => (c.url === "/api/ai" ? { status: 403, json: { error: "limit", code: "guest_limit" } } : undefined));
    const { u } = await open();
    await u.type(box(), "One more");
    await u.keyboard("{Enter}");
    expect(await screen.findByText(/SAVE PROMPT exhausted/)).toBeTruthy();
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toBe("Save your trip to keep chatting");
    expect(box().value).toBe("One more");
    expect(toast).not.toHaveBeenCalled();
  });

  it("counts free messages left once a guest has asked twice, and opens the save card early on request", async () => {
    guestState = { guest: true };
    thread = [user("1", "a"), roam("2", "b"), user("3", "c"), roam("4", "d")];
    const { u } = await open();
    expect(screen.getByText(/free messages? left/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Save your trip" }));
    expect(await screen.findByText(/SAVE PROMPT early/)).toBeTruthy();
  });
});

describe("ConversationSurface: proposed changes", () => {
  const proposal = { type: "update_preferences", preferences: { budget: 120 } };
  const withProposal = (cmd: unknown): Handler => (c) => (c.url === "/api/ai" ? { sse: sse("I can set that.", { surface: "explore", blocks: [], suggestedFollowups: [], proposedCommand: cmd }) } : undefined);

  it("asks before saving, then saves on Confirm and says what changed", async () => {
    handlers.push(withProposal(proposal));
    handlers.push((c) => (c.url === "/api/commands" ? { json: { changeImpact: "Budget set to 120." } } : undefined));
    const { u } = await open();
    await u.type(box(), "Make my budget 120");
    await u.keyboard("{Enter}");
    const region = await screen.findByRole("region", { name: "Confirm change" });
    expect(region.textContent).toContain("Set the daily budget to 120 per person?");
    await u.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Budget set to 120.", "success"));
    expect(calls.find((c) => c.url === "/api/commands")!.body).toMatchObject({ type: "update_preferences", preferences: { budget: 120 } });
    expect(screen.queryByRole("region", { name: "Confirm change" })).toBeNull();
  });

  it("gives a record_decision command a stable idempotency key", async () => {
    handlers.push(withProposal({ type: "record_decision", tripId: TRIP, kind: "stay_choice", value: { hotel: "Alfama Inn" } }));
    const { u } = await open();
    await u.type(box(), "We chose the hotel");
    await u.keyboard("{Enter}");
    await u.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/commands")).toBe(true));
    expect(typeof calls.find((c) => c.url === "/api/commands")!.body!.idempotencyKey).toBe("string");
  });

  it("dismisses on Cancel without saving anything", async () => {
    handlers.push(withProposal(proposal));
    const { u } = await open();
    await u.type(box(), "Make my budget 120");
    await u.keyboard("{Enter}");
    await u.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Confirm change" })).toBeNull();
    expect(calls.some((c) => c.url === "/api/commands")).toBe(false);
  });

  it("says so, and keeps the card, when the change cannot be saved", async () => {
    handlers.push(withProposal(proposal));
    handlers.push((c) => (c.url === "/api/commands" ? { status: 500 } : undefined));
    const { u } = await open();
    await u.type(box(), "Make my budget 120");
    await u.keyboard("{Enter}");
    await u.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That change couldn’t be saved.", "error"));
    expect(screen.getByRole("region", { name: "Confirm change" })).toBeTruthy();
  });

  it("offers no save proposals to a guest", async () => {
    guestState = { guest: true };
    handlers.push(withProposal(proposal));
    const { u } = await open();
    await u.type(box(), "Make my budget 120");
    await u.keyboard("{Enter}");
    await screen.findByText("I can set that.");
    expect(screen.queryByRole("region", { name: "Confirm change" })).toBeNull();
  });
});

describe("ConversationSurface: arriving from the landing page", () => {
  it("shows the visitor's first sentence at once and sends it exactly once after the thread loads", async () => {
    sessionStorage.setItem(`wn:first-message:${TRIP}`, "A week in Lisbon");
    handlers.push(replyTo("Lovely, Lisbon it is."));
    render(<ConversationSurface tripId={TRIP} />);
    expect(screen.getByText("A week in Lisbon")).toBeTruthy();
    await screen.findByText("Lovely, Lisbon it is.", undefined, { timeout: 3000 });
    expect(aiCalls()).toHaveLength(1);
    expect(aiCalls()[0].body).toMatchObject({ messages: [{ role: "user", content: "A week in Lisbon" }] });
    expect(sessionStorage.getItem(`wn:first-message:${TRIP}`)).toBeNull();
    expect(screen.getAllByText("A week in Lisbon")).toHaveLength(1);
  });

  it("does not send the hand-off sentence into a thread that already has a message from the visitor", async () => {
    sessionStorage.setItem(`wn:first-message:${TRIP}`, "stale hand-off");
    thread = [user("1", "Already talking"), roam("2", "Yes?")];
    await open();
    await new Promise((r) => setTimeout(r, 50));
    expect(aiCalls()).toHaveLength(0);
  });
});

describe("ConversationSurface: what a reply can carry", () => {
  it("notes a degraded answer and unavailable providers, and lists sources", async () => {
    thread = [
      user("1", "Hotels?"),
      roam("2", "Here is what I know.", {
        metadata: { degraded: true, unavailableProviders: ["liteapi", "duffel"], sources: [{ title: "Lisbon guide", url: "https://www.example.com/lisbon" }], blocks: [], suggestedFollowups: [] },
      }),
    ];
    await open();
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("the planner had trouble reading that one");
    expect(note.textContent).toContain("Couldn’t check hotel rates, flight fares just now");
    expect(screen.getByText("Lisbon guide")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
  });

  it("warns when a reply was not saved or may be cut off", async () => {
    thread = [roam("1", "Partial", { metadata: { persistFailed: true, truncated: true, blocks: [], suggestedFollowups: [] } })];
    await open();
    expect(screen.getByRole("note").textContent).toContain("This reply wasn’t saved");
    expect(screen.getByRole("note").textContent).toContain("may have been cut off");
  });
});

