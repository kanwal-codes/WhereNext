// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupMessage } from "../../features/group-chat/domain/message";

/**
 * Characterization tests for the group chat screen: what a member sees and which requests go out, with the network
 * faked. They pin today's behaviour so the screen's internals can be reorganised without changing it.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
const ME = "u-me";
const FRIEND = "u-friend";

const toast = vi.fn();
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ me: { userId: ME }, data: { trip: { name: "Lisbon" } } }) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanel: () => ({ openPanel: vi.fn() }) }));
vi.mock("@/lib/client/trip-realtime", () => ({ useChatLive: () => true }));
vi.mock("@/lib/client/use-trip-members", () => ({
  memberLabel: (m?: { name?: string }) => m?.name ?? "Someone",
  useTripMembers: () => ({ loaded: true, members: [{ userId: ME, name: "Me" }, { userId: FRIEND, name: "Priya" }] }),
}));
vi.mock("@/features/conversation/ui/ConversationSurface", () => ({ RAIL_MEASURE: "max-w-2xl" }));
vi.mock("@/features/conversation/ui/AssistantMessage", () => ({ AssistantMessage: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock("@/features/conversation/ui/blocks/MessageBlocks", () => ({ MessageBlocks: () => null }));
vi.mock("../../features/group-chat/ui/GroupInviteCard", () => ({ GroupInviteCard: () => <div>INVITE CARD</div> }));

import { GroupChatSurface } from "../../features/group-chat/ui/GroupChatSurface";

const at = (n: number) => new Date(Date.UTC(2026, 9, 10, 10, n)).toISOString();
const msg = (id: string, over: Partial<GroupMessage> = {}): GroupMessage => ({ id, userId: FRIEND, role: "user", kind: "text", content: `text ${id}`, metadata: {}, created_at: at(0), reactions: [], ...over });

type Call = { method: string; url: string; body?: Record<string, unknown> };
type Handler = (call: Call) => { status?: number; json?: unknown } | Promise<{ status?: number; json?: unknown }> | undefined;

let calls: Call[];
let handlers: Handler[];
let history: GroupMessage[];

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const out = await h(call);
      if (out) return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json", date: new Date().toUTCString() } });
    }
    if (call.method === "GET" && call.url.includes("/group-chat")) return new Response(JSON.stringify({ messages: history }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }));
}

const posts = (suffix: string) => calls.filter((c) => c.method === "POST" && c.url.endsWith(suffix));

async function open(props: Partial<React.ComponentProps<typeof GroupChatSurface>> = {}) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const utils = render(<GroupChatSurface tripId={TRIP} {...props} />);
  await waitFor(() => expect((screen.getByLabelText("Message the group") as HTMLTextAreaElement).disabled).toBe(false));
  return { user, ...utils };
}

const box = () => screen.getByLabelText("Message the group") as HTMLTextAreaElement;

beforeEach(() => {
  sessionStorage.clear();
  toast.mockClear();
  history = [msg("1", { userId: FRIEND, content: "Who is up for tapas?", created_at: at(0) }), msg("2", { userId: ME, content: "Me!", created_at: at(1) })];
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
});

describe("GroupChatSurface: reading", () => {
  it("shows a loading composer first, then the history with each sender named", async () => {
    render(<GroupChatSurface tripId={TRIP} />);
    expect(box().disabled).toBe(true);
    expect(box().placeholder).toBe("Loading…");
    await screen.findByText("Who is up for tapas?");
    expect(screen.getByText("Me!")).toBeTruthy();
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(box().placeholder).toBe("Message the group");
    expect(calls.filter((c) => c.method === "GET" && c.url === `/api/trips/${TRIP}/group-chat`)).toHaveLength(1);
  });

  it("says so, with a way to try again, when the chat cannot be loaded at all", async () => {
    handlers.push((c) => (c.method === "GET" ? { status: 500 } : undefined));
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<GroupChatSurface tripId={TRIP} />);
    await screen.findByText("Couldn’t load the chat.");
    handlers.length = 0;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Who is up for tapas?");
  });

  it("opens an empty chat with the starters", async () => {
    history = [];
    await open();
    expect(screen.getByText("Plan it together")).toBeTruthy();
    expect(screen.getByRole("button", { name: "@Roam what should we do first?" })).toBeTruthy();
  });

  it("lays out the newest 20 first and reveals the earlier ones from the page already in hand, with no request", async () => {
    history = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, { content: `line ${i}`, created_at: at(i) }));
    const user = (await open()).user;
    expect(screen.queryByText("line 5")).toBeNull();
    expect(screen.getByText("line 29")).toBeTruthy();
    const before = calls.length;
    await user.click(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(screen.getByText("line 5")).toBeTruthy();
    expect(calls.length).toBe(before);
  });
});

describe("GroupChatSurface: sending", () => {
  it("shows the message at once as Sending…, posts it once with an idempotency key, then settles", async () => {
    let release!: (v: { json: unknown }) => void;
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/group-chat") ? new Promise((r) => { release = r; }) : undefined));
    const { user } = await open();
    await user.type(box(), "Dinner at 8?");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Sending…")).toBeTruthy();
    expect(screen.getByText("Dinner at 8?")).toBeTruthy();
    expect(box().value).toBe("");
    expect(posts("/group-chat")).toHaveLength(1);
    const body = posts("/group-chat")[0].body!;
    expect(body).toMatchObject({ content: "Dinner at 8?", kind: "text" });
    expect(typeof body.idempotencyKey).toBe("string");
    await act(async () => release({ json: { message: msg("new", { userId: ME, content: "Dinner at 8?", created_at: at(5) }) } }));
    await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
    expect(screen.getAllByText("Dinner at 8?")).toHaveLength(1);
  });

  it("does not send an empty message, or '@Roam' with nothing after it", async () => {
    const { user } = await open();
    await user.type(box(), "   ");
    await user.keyboard("{Enter}");
    await user.clear(box());
    await user.type(box(), "@Roam");
    await user.keyboard("{Enter}");
    expect(posts("/group-chat")).toHaveLength(0);
  });

  it("keeps a failed message with Retry, and a retry reuses the same key so it can never post twice", async () => {
    let attempt = 0;
    handlers.push((c) => {
      if (c.method === "POST" && c.url.endsWith("/group-chat")) {
        attempt += 1;
        return attempt === 1 ? { status: 503, json: {} } : { json: { message: msg("sent", { userId: ME, content: "Retry me", created_at: at(6) }) } };
      }
    });
    const { user } = await open();
    await user.type(box(), "Retry me");
    await user.keyboard("{Enter}");
    await screen.findByText(/Not sent/);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull());
    const [first, second] = posts("/group-chat");
    expect(first.body!.idempotencyKey).toBe(second.body!.idempotencyKey);
    expect(screen.getAllByText("Retry me")).toHaveLength(1);
  });

  it("lets you delete a message that failed to send", async () => {
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/group-chat") ? { status: 400, json: {} } : undefined));
    const { user } = await open();
    await user.type(box(), "Nope");
    await user.keyboard("{Enter}");
    await screen.findByText(/Not sent/);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByText("Nope")).toBeNull();
  });

  it("asks Roam to answer once a message that mentions it has been delivered", async () => {
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/group-chat") ? { json: { message: msg("ask", { userId: ME, content: "@Roam where to eat?", created_at: at(7) }) } } : undefined));
    const { user } = await open();
    await user.type(box(), "@Roam where to eat?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(posts("/group-chat/roam")).toHaveLength(1));
    expect(posts("/group-chat/roam")[0].body).toMatchObject({ messageId: "ask" });
  });

  it("sends a double Enter only once", async () => {
    const { user } = await open();
    await user.type(box(), "Once");
    fireEvent.keyDown(box(), { key: "Enter" });
    fireEvent.keyDown(box(), { key: "Enter" });
    await waitFor(() => expect(posts("/group-chat")).toHaveLength(1));
  });

  it("keeps a half-typed message when you leave and come back", async () => {
    const first = await open();
    await first.user.type(box(), "still thinking");
    first.unmount();
    await open();
    expect(box().value).toBe("still thinking");
  });
});

describe("GroupChatSurface: reacting and voting", () => {
  it("adds a reaction at once and tells the server", async () => {
    const { user } = await open();
    await user.click(screen.getAllByRole("button", { name: "Add reaction" })[0]);
    await user.click(screen.getByRole("button", { name: "React 👍" }));
    expect(await screen.findByRole("button", { name: "👍 1, you reacted" })).toBeTruthy();
    expect(posts("/group-chat/1/reactions")[0].body).toEqual({ emoji: "👍" });
  });

  it("takes a reaction back when you tap your own chip", async () => {
    history = [msg("1", { reactions: [{ emoji: "🎉", count: 1, mine: true }] })];
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "🎉 1, you reacted" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /🎉/ })).toBeNull());
    expect(posts("/group-chat/1/reactions")).toHaveLength(1);
  });

  const poll = () => msg("poll-msg", { kind: "poll", content: "Where to stay?", metadata: { poll: { id: "poll-1", totalVotes: 1, options: [{ key: "a", label: "Alfama", count: 1, mine: true }, { key: "b", label: "Baixa", count: 0, mine: false }] } } });

  it("moves your vote to the other option immediately and posts it", async () => {
    history = [poll()];
    const { user } = await open();
    expect(screen.getByText("1 · 100%")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Baixa/ }));
    await waitFor(() => expect(screen.getByText("1 · 100%")).toBeTruthy());
    expect(screen.getByText("0 · 0%")).toBeTruthy();
    expect(posts("/polls/poll-1/vote")[0].body).toEqual({ optionKey: "b" });
  });

  it("puts the vote back to what the server says, and tells you, when it does not save", async () => {
    history = [poll()];
    handlers.push((c) => (c.url.endsWith("/vote") ? { status: 500 } : undefined));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /Baixa/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Your vote didn’t save.", "error"));
  });

  it("starts a poll from the + menu, and shows it in the chat", async () => {
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/polls") ? { json: { message: poll() } } : undefined));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add to the chat" }));
    await user.click(await screen.findByRole("menuitem", { name: /Poll/ }));
    // Change events, not keystrokes: the sheet takes focus a beat after it opens, which would cut a fast synthetic typing run short.
    fireEvent.change(await screen.findByLabelText("Poll question"), { target: { value: "Where to stay?" } });
    fireEvent.change(screen.getByLabelText("Poll option 1"), { target: { value: "Alfama" } });
    fireEvent.change(screen.getByLabelText("Poll option 2"), { target: { value: "Baixa" } });
    await user.click(screen.getByRole("button", { name: "Start poll" }));
    await waitFor(() => expect(posts("/polls")).toHaveLength(1));
    expect(posts("/polls")[0].body).toEqual({ question: "Where to stay?", options: ["Alfama", "Baixa"] });
    expect((await screen.findAllByText("Where to stay?")).length).toBeGreaterThan(0);
  });

  it("will not start a poll without a question and two options", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add to the chat" }));
    await user.click(await screen.findByRole("menuitem", { name: /Poll/ }));
    const start = await screen.findByRole("button", { name: "Start poll" });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Poll question"), { target: { value: "Q" } });
    fireEvent.change(screen.getByLabelText("Poll option 1"), { target: { value: "only one" } });
    expect((start as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("GroupChatSurface: connection", () => {
  it("says it is offline, and reads the chat again when it comes back", async () => {
    await open();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(await screen.findByText(/You’re offline/)).toBeTruthy();
    const before = calls.filter((c) => c.method === "GET").length;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(/You’re offline/)).toBeNull());
  });

  it("re-reads the thread when a group-chat change arrives on the realtime bus", async () => {
    await open();
    const before = calls.filter((c) => c.method === "GET").length;
    history = [...history, msg("3", { content: "New from Priya", created_at: at(9) })];
    const { announceWorkspaceChange } = await import("../../lib/application/workspace-events");
    await act(async () => { announceWorkspaceChange("groupChat"); });
    expect(await screen.findByText("New from Priya")).toBeTruthy();
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(before);
  });

  it("shows nothing about Roam typing until an @Roam ask is waiting for a reply", async () => {
    await open();
    expect(screen.queryByText("Roam is typing")).toBeNull();
  });
});
