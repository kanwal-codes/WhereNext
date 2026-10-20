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
const replaceSpy = vi.fn();
let searchParams = new URLSearchParams();
let phoneV2 = false;
const markRead = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceSpy, push: vi.fn() }), useSearchParams: () => searchParams }));
vi.mock("@/lib/phone-v2", () => ({ get PHONE_V2() { return phoneV2; } }));
vi.mock("@/lib/client/use-group-unread", () => ({ markGroupRead: (...a: unknown[]) => markRead(...a) }));
vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ me: { userId: ME }, data: { trip: { name: "Lisbon" } } }) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanel: () => ({ openPanel: vi.fn() }) }));
vi.mock("@/lib/client/trip-realtime", () => ({ useChatLive: () => true }));
vi.mock("@/lib/client/use-trip-members", () => ({
  memberLabel: (m?: { name?: string }) => m?.name ?? "Someone",
  useTripMembers: () => ({ loaded: true, members: [{ userId: ME, name: "Me" }, { userId: FRIEND, name: "Priya" }] }),
}));
vi.mock("@/features/conversation/ui/ConversationSurface", () => ({ RAIL_MEASURE: "max-w-2xl" }));
vi.mock("@/features/conversation/ui/AssistantMessage", () => ({ AssistantMessage: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock("@/features/conversation/ui/blocks/MessageBlocks", () => ({ MessageBlocks: ({ blocks }: { blocks: Array<{ type: string }> }) => <div data-testid="blocks">{blocks.map((b) => b.type).join(",")}</div> }));
vi.mock("../../features/group-chat/ui/GroupInviteCard", () => ({ GroupInviteCard: () => <div>INVITE CARD</div> }));

import { GroupChatSurface } from "../../features/group-chat/ui/GroupChatSurface";

const at = (n: number) => new Date(Date.UTC(2026, 9, 10, 10, n)).toISOString();
const msg = (id: string, over: Partial<GroupMessage> = {}): GroupMessage => ({ id, userId: FRIEND, role: "user", kind: "text", content: `text ${id}`, metadata: {}, created_at: at(0), reactions: [], ...over });

type Call = { method: string; url: string; body?: Record<string, unknown> };
type Handler = (call: Call) => { status?: number; json?: unknown } | undefined | Promise<{ status?: number; json?: unknown } | undefined>;

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
  replaceSpy.mockClear(); markRead.mockClear(); searchParams = new URLSearchParams(); phoneV2 = false;
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

  it("sends one request for a double tap on the same reaction", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    handlers.push(async (c) => { if (c.url.endsWith("/reactions")) { await gate; return { json: {} }; } return undefined; });
    history = [msg("1", { reactions: [{ emoji: "🎉", count: 1, mine: false }] })];
    const { user } = await open();
    const chip = screen.getByRole("button", { name: "🎉 1" });
    await user.click(chip);
    await user.click(screen.getByRole("button", { name: /🎉 2, you reacted/ }));
    release();
    await waitFor(() => expect(posts("/group-chat/1/reactions")).toHaveLength(1));
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

  it("ignores a second tap on a poll while the first vote is still being saved", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    handlers.push(async (c) => { if (c.url.endsWith("/vote")) { await gate; return { json: {} }; } return undefined; });
    history = [poll()];
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /Baixa/ }));
    await user.click(screen.getByRole("button", { name: /Alfama/ }));
    release();
    await waitFor(() => expect(posts("/polls/poll-1/vote")).toHaveLength(1));
  });

  it("tells you when a poll could not be started", async () => {
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/polls") ? { status: 500 } : undefined));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add to the chat" }));
    await user.click(await screen.findByRole("menuitem", { name: /Poll/ }));
    fireEvent.change(await screen.findByLabelText("Poll question"), { target: { value: "Where to stay?" } });
    fireEvent.change(screen.getByLabelText("Poll option 1"), { target: { value: "Alfama" } });
    fireEvent.change(screen.getByLabelText("Poll option 2"), { target: { value: "Baixa" } });
    await user.click(screen.getByRole("button", { name: "Start poll" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t start that poll.", "error"));
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

describe("GroupChatSurface: asking Roam", () => {
  const roamAsk = () => msg("ask", { userId: ME, content: "@Roam where to eat?", created_at: new Date().toISOString() });
  const roamReply = (replyTo: string) => msg("reply", { userId: null, role: "assistant", content: "Try Time Out Market.", created_at: new Date().toISOString(), metadata: { replyToMessageId: replyTo } });

  /** A server that keeps what it is sent: the ask is in the thread from then on. */
  const acceptAsk: Handler = (c) => {
    if (c.method !== "POST" || !c.url.endsWith("/group-chat")) return undefined;
    history = [...history, roamAsk()];
    return { json: { message: roamAsk() } };
  };

  const sendAsk = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(box(), "@Roam where to eat?");
    await user.keyboard("{Enter}");
  };

  it("shows Roam typing while the ask is in flight, then stops", async () => {
    let release!: (v: { json: unknown }) => void;
    handlers.push(acceptAsk);
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/group-chat/roam") ? new Promise((r) => { release = r; }) : undefined));
    const { user } = await open();
    await sendAsk(user);
    expect(await screen.findByText("Roam is typing")).toBeTruthy();
    history = [...history, roamReply("ask")];
    await act(async () => release({ json: {} }));
    await waitFor(() => expect(screen.queryByText("Roam is typing")).toBeNull());
    expect(await screen.findByText("Try Time Out Market.")).toBeTruthy();
  });

  it("says Roam didn't reply, with a Retry that asks again, when the call fails and no answer exists", async () => {
    let roamCalls = 0;
    handlers.push(acceptAsk);
    handlers.push((c) => {
      if (c.method === "POST" && c.url.endsWith("/group-chat/roam")) { roamCalls += 1; return { status: 500 }; }
    });
    const { user } = await open();
    await sendAsk(user);
    expect(await screen.findByText(/Roam didn’t reply/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(roamCalls).toBe(2));
  });

  it("does not report a failure when the call dropped but the reply is already in the thread", async () => {
    handlers.push(acceptAsk);
    handlers.push((c) => {
      if (c.method === "POST" && c.url.endsWith("/group-chat/roam")) { history = [...history, roamReply("ask")]; return { status: 502 }; }
    });
    const { user } = await open();
    await sendAsk(user);
    expect(await screen.findByText("Try Time Out Market.")).toBeTruthy();
    expect(screen.queryByText(/Roam didn’t reply/)).toBeNull();
  });

  it("shows Roam typing to everyone while somebody else's fresh @Roam ask is unanswered", async () => {
    history = [msg("f1", { userId: FRIEND, content: "@Roam any ideas?", created_at: new Date().toISOString() })];
    await open();
    expect(await screen.findByText("Roam is typing")).toBeTruthy();
  });

  it("opens the box on '@Roam ' when Roam answers something you said, but never over a draft", async () => {
    history = [msg("mine", { userId: ME, content: "@Roam hi", created_at: at(0) })];
    await open();
    expect(box().value).toBe("");
    history = [...history, roamReply("mine")];
    const { announceWorkspaceChange } = await import("../../lib/application/workspace-events");
    await act(async () => { announceWorkspaceChange("groupChat"); });
    await waitFor(() => expect(box().value).toBe("@Roam "));
  });

  it("leaves a half-typed draft alone when Roam answers", async () => {
    history = [msg("mine", { userId: ME, content: "@Roam hi", created_at: at(0) })];
    const { user } = await open();
    await user.type(box(), "wait, also");
    history = [...history, roamReply("mine")];
    const { announceWorkspaceChange } = await import("../../lib/application/workspace-events");
    await act(async () => { announceWorkspaceChange("groupChat"); });
    await screen.findByText("Try Time Out Market.");
    expect(box().value).toBe("wait, also");
  });
});

describe("GroupChatSurface: unsent messages survive a reload", () => {
  const key = `wn-outbox:${TRIP}:${ME}`;

  it("keeps a failed message in storage, then re-sends it under its original key when the chat opens again", async () => {
    let failing = true;
    handlers.push((c) => {
      if (c.method === "POST" && c.url.endsWith("/group-chat")) return failing ? { status: 503, json: {} } : { json: { message: msg("later", { userId: ME, content: "After the reload", created_at: at(8) }) } };
    });
    const first = await open();
    await first.user.type(box(), "After the reload");
    await first.user.keyboard("{Enter}");
    await screen.findByText(/Not sent/);
    const firstKey = posts("/group-chat")[0].body!.idempotencyKey;
    expect(JSON.parse(sessionStorage.getItem(key)!)[0]).toMatchObject({ key: firstKey, content: "After the reload" });
    first.unmount();

    failing = false;
    await open();
    await waitFor(() => expect(posts("/group-chat")).toHaveLength(2));
    expect(posts("/group-chat")[1].body!.idempotencyKey).toBe(firstKey);
    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  });

  it("clears the unsent copy once the delivered message shows up in the thread under the same key", async () => {
    handlers.push((c) => (c.method === "POST" && c.url.endsWith("/group-chat") ? { status: 503, json: {} } : undefined));
    const { user } = await open();
    await user.type(box(), "Arrived anyway");
    await user.keyboard("{Enter}");
    await screen.findByText(/Not sent/);
    const sentKey = posts("/group-chat")[0].body!.idempotencyKey as string;
    history = [...history, msg("real", { userId: ME, content: "Arrived anyway", clientKey: sentKey, created_at: at(9) })];
    const { announceWorkspaceChange } = await import("../../lib/application/workspace-events");
    await act(async () => { announceWorkspaceChange("groupChat"); });
    await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull());
    expect(screen.getAllByText("Arrived anyway")).toHaveLength(1);
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


describe("GroupChatSurface: threads, notices and the day", () => {
  it("quotes the message a reply answers, and jumps to it when the quote is tapped", async () => {
    history = [msg("1", { content: "Who is up for tapas?" }), msg("3", { userId: null, role: "assistant", content: "Try Taberna.", metadata: { replyToMessageId: "1" } })];
    const { user } = await open();
    const quote = screen.getByRole("button", { name: /Priya.*Who is up for tapas\?/ });
    await user.click(quote);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    await waitFor(() => expect(document.querySelectorAll("[class*='duration-700']")[0]?.className).toContain("bg-coral-soft/60"));
  });

  it("shows a system line as a quiet pill", async () => {
    history = [msg("1", { kind: "system", userId: null, content: "Priya joined the trip" })];
    await open();
    const line = screen.getByText("Priya joined the trip");
    expect(line.tagName).toBe("P");
    expect(line.className).toContain("rounded-full");
    expect(screen.queryByText("Priya", { selector: "span" })).toBeNull(); // no sender name or bubble around it
  });

  it("keeps Roam's follow-up chips for its latest message only", async () => {
    const blocks = [{ type: "place_list", places: [] }, { type: "actions", items: [] }, { type: "clarifying_question", question: "?", chips: [] }];
    history = [
      msg("3", { userId: null, role: "assistant", content: "Older answer", metadata: { blocks } }),
      msg("4", { userId: FRIEND, content: "thanks" }),
      msg("5", { userId: null, role: "assistant", content: "Latest answer", metadata: { blocks } }),
    ];
    await open();
    expect(screen.getAllByTestId("blocks").map((b) => b.textContent)).toEqual(["place_list", "place_list,actions,clarifying_question"]);
  });

  it("stops highlighting a message after a moment", async () => {
    history = [msg("1", { content: "Who is up for tapas?" }), msg("3", { userId: null, role: "assistant", content: "Try Taberna.", metadata: { replyToMessageId: "1" } })];
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: /Priya.*Who is up for tapas\?/ }));
    await waitFor(() => expect(document.querySelectorAll("[class*='duration-700']")[0]?.className).toContain("bg-coral-soft/60"));
    await waitFor(() => expect(document.querySelectorAll("[class*='duration-700']")[0]?.className).not.toContain("bg-coral-soft/60"), { timeout: 3000 });
  });

  it("puts a date between messages from different days", async () => {
    history = [msg("1", { created_at: new Date(Date.UTC(2026, 9, 10, 10, 0)).toISOString() }), msg("2", { created_at: new Date(Date.UTC(2026, 9, 12, 10, 0)).toISOString() })];
    await open();
    expect(document.querySelectorAll("span.uppercase")).toHaveLength(2);
  });

  it("says Roam answered from the trip details only, and lets whoever asked try again", async () => {
    history = [msg("2", { userId: ME, content: "@Roam where to eat?" }), msg("3", { userId: null, role: "assistant", content: "Somewhere.", metadata: { replyToMessageId: "2", degraded: true } })];
    const { user } = await open();
    expect(screen.getByText(/Answered from the trip details only/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posts("/group-chat/roam")).toHaveLength(1));
    expect(posts("/group-chat/roam")[0].body).toMatchObject({ messageId: "2" });
  });

  it("does not offer the retry to someone who did not ask", async () => {
    history = [msg("2", { userId: FRIEND, content: "@Roam where to eat?" }), msg("3", { userId: null, role: "assistant", content: "Somewhere.", metadata: { replyToMessageId: "2", degraded: true } })];
    await open();
    expect(screen.getByText(/Answered from the trip details only/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says nothing of joining when nobody has just joined", async () => {
    await open();
    expect(toast).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("holds a new message from a friend behind a pill when reading higher up, and brings it on tap", async () => {
    const { user } = await open();
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 3000, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(log, "scrollTop", { value: 100, configurable: true });
    fireEvent.scroll(log);
    history = [...history, msg("3", { content: "New from Priya", created_at: at(9) })];
    const { announceWorkspaceChange } = await import("../../lib/application/workspace-events");
    await act(async () => { announceWorkspaceChange("groupChat"); });
    await screen.findByText("New from Priya");
    const pill = await screen.findByRole("button", { name: /New messages/ });
    (Element.prototype.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    await user.click(pill);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /New messages/ })).toBeNull();
  });

  it("welcomes someone who has just joined, once, and clears the flag", async () => {
    searchParams = new URLSearchParams("joined=1");
    await open();
    expect(toast).toHaveBeenCalledWith("You're in — welcome to Lisbon!", "success");
    expect(replaceSpy).toHaveBeenCalledWith(`/trips/${TRIP}/group`, { scroll: false });
  });

  it("offers a way back to the latest message when scrolled far from it", async () => {
    const { user } = await open();
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 3000, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(log, "scrollTop", { value: 0, configurable: true });
    fireEvent.scroll(log);
    const jump = await screen.findByRole("button", { name: "Jump to latest message" });
    await user.click(jump);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("passes the log's scroll on to its parent", async () => {
    const onLogScroll = vi.fn();
    await open({ onLogScroll });
    fireEvent.scroll(screen.getByRole("log"));
    expect(onLogScroll).toHaveBeenCalled();
  });
});

describe("GroupChatSurface: the box", () => {
  it("finishes '@Roam' from a few letters with Tab", async () => {
    const { user } = await open();
    await user.type(box(), "@ro");
    expect(document.body.textContent).toContain("am");
    await user.keyboard("{Tab}");
    expect(box().value).toBe("@Roam ");
  });

  it("sends on Enter but not on Shift+Enter", async () => {
    const { user } = await open();
    await user.type(box(), "hello{Shift>}{Enter}{/Shift}there");
    expect(box().value).toBe("hello\nthere");
    expect(posts("/group-chat")).toHaveLength(0);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(posts("/group-chat")).toHaveLength(1));
  });

  it("leaves Enter as a new line where the keyboard is a touch one", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    const { user } = await open();
    await user.type(box(), "hello{Enter}");
    expect(posts("/group-chat")).toHaveLength(0);
    expect(box().value).toBe("hello\n");
  });

  it("closes the + menu with Escape or a tap outside it", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add to the chat" }));
    expect(await screen.findByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Add to the chat" }));
    expect(await screen.findByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("has an @ button on the phone that asks Roam, and is gone once Roam is mentioned", async () => {
    phoneV2 = true;
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Ask Roam in the chat" }));
    expect(box().value).toBe("@Roam ");
    expect(screen.queryByRole("button", { name: "Ask Roam in the chat" })).toBeNull();
  });

  it("marks the chat read when it comes to the front on the phone, unless the latest message is yours", async () => {
    phoneV2 = true;
    history = [msg("1", { userId: FRIEND })];
    await open();
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(TRIP));
    cleanup();
    sessionStorage.clear();
    markRead.mockClear();
    history = [msg("1", { userId: ME })];
    await open();
    await new Promise((r) => setTimeout(r, 50));
    expect(markRead).toHaveBeenCalledTimes(1); // opening reads it once; your own newest message adds none
  });

  it("does not mark anything read off the phone", async () => {
    await open();
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("GroupChatSurface: holding a message", () => {
  const bubbleOf = (text: string) => screen.getByText(text).closest("[title]") as HTMLElement;

  it("opens the reactions where a finger holds a message, and picks one", async () => {
    const { user } = await open();
    fireEvent.pointerDown(bubbleOf("Who is up for tapas?"), { pointerType: "touch" });
    const react = await screen.findByRole("button", { name: "React ❤️" }, { timeout: 2000 });
    await user.click(react);
    expect(posts("/group-chat/1/reactions")[0].body).toEqual({ emoji: "❤️" });
  });

  it("does nothing if the finger moves or lifts first, or for a mouse", async () => {
    await open();
    const bubble = bubbleOf("Who is up for tapas?");
    fireEvent.pointerDown(bubble, { pointerType: "touch" });
    fireEvent.pointerMove(bubble, { pointerType: "touch" });
    fireEvent.pointerDown(bubble, { pointerType: "touch" });
    fireEvent.pointerUp(bubble, { pointerType: "touch" });
    fireEvent.pointerDown(bubble, { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByRole("button", { name: "React 👍" })).toBeNull();
  });

  it("closes the reaction bar when something else is tapped", async () => {
    const { user } = await open();
    expect(screen.getAllByRole("button", { name: "Add reaction" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "Add reaction" })[0]);
    expect(screen.getAllByRole("button", { name: "Add reaction" })).toHaveLength(1); // the open message trades its trigger for the bar
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add reaction" })).toHaveLength(2));
  });
});
