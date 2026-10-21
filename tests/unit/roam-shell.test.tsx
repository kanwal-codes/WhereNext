// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the Roam shell: the Roam | Chat tabs and the two panes, the trip-context rail and the detail panel beside
 * them on a wide screen, and the sheets and header buttons on a phone. The chat surfaces, panel and data are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let desktop = true;
let guest = false;
let panel: Any | null;
let keyboardOpen = false;
let sheetPanel = false;
let header: Any = {};
let conv: Any = {};
let group: Any = {};
const openPanel = vi.fn();
const closePanel = vi.fn();
const openGate = vi.fn();

vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => desktop }));
vi.mock("@/lib/use-keyboard-fit", () => ({ useKeyboardFit: () => keyboardOpen }));
vi.mock("@/lib/use-panel-style", () => ({ usePanelStyle: () => (sheetPanel ? "sheet" : "page") }));
vi.mock("@/components/shell/PhoneHeader", () => ({ PHONE_ROUND: "round", useSetPhoneHeader: (h: Any) => { header = h; } }));
vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => ({ data: { trip: { id: TRIP }, preferences: {}, decisions: [] } }) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest, openGate }) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanel: () => ({ panel, openPanel, closePanel }), panelTitle: (p: Any) => `title:${p.kind}` }));
vi.mock("@/components/TripPanel", () => ({ TripPanel: () => <div data-testid="trip-panel" /> }));
vi.mock("@/components/GroupMembersBadge", () => ({ GroupMembersBadge: () => <div data-testid="members" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, onClick, className }: Any) => <a href={href} onClick={onClick} className={className}>{children}</a> }));
vi.mock("@/components/SegmentedSwitch", () => ({
  SegmentedSwitch: ({ options, value, onChange }: Any) => <div role="group" aria-label="Conversation">{options.map((o: Any) => <button key={o.key} type="button" aria-label={o.ariaLabel} aria-pressed={value === o.key} data-href={o.href} data-locked={String(Boolean(o.locked))} onClick={() => onChange(o.key)}>{o.label}</button>)}</div>,
}));
vi.mock("@/components/motion-primitives", () => ({
  Reveal: ({ children }: Any) => <div>{children}</div>,
  Sheet: ({ open, children, ariaLabel }: Any) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null),
  motionTokens: { swap: { duration: 0.2, ease: [0.2, 0.4, 0.6, 0.8] }, fast: { duration: 0.1 } },
}));
vi.mock("motion/react", () => {
  const Div = React.forwardRef<HTMLDivElement, Any>(function Div({ children, initial, animate, exit, transition, ...rest }, ref) { void initial; void animate; void exit; void transition; return <div ref={ref} {...rest}>{children}</div>; });
  return { motion: { div: Div }, AnimatePresence: ({ children }: Any) => <>{children}</>, useReducedMotion: () => true };
});
vi.mock("@/features/conversation/ui/ConversationSurface", () => ({
  ConversationSurface: (p: Any) => { conv = p; return <div data-testid="roam-surface" data-rail={String(p.rail)} data-view={p.viewContext ?? ""} />; },
}));
vi.mock("@/features/group-chat/ui/GroupChatSurface", () => ({
  GroupChatSurface: (p: Any) => { group = p; return <div data-testid="group-surface" data-rail={String(p.rail)} data-active={String(p.active)} />; },
}));
vi.mock("@/features/workspace/ui/TripContextSurface", () => ({ TripContextSurface: () => <div data-testid="context" /> }));

import { RoamShell } from "../../features/roam/ui/RoamShell";

const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const shell = (tab: "roam" | "group" = "roam") => render(<RoamShell tripId={TRIP} activeTab={tab} />);
const grid = () => document.querySelector<HTMLElement>("[data-roam-shell] > div")!;
// One log element, scrolled to a new place each time: the shell tracks how far a reader has run in one direction.
const log = document.createElement("div");
let logTop = 0;
Object.defineProperty(log, "scrollTop", { get: () => logTop, configurable: true });
Object.defineProperty(log, "scrollHeight", { value: 1500, configurable: true });
Object.defineProperty(log, "clientHeight", { value: 500, configurable: true });
const scroll = (top: number) => { logTop = top; return { currentTarget: log } as never; };

beforeEach(() => {
  logTop = 0; desktop = true; guest = false; panel = null; keyboardOpen = false; sheetPanel = false; header = {}; conv = {}; group = {};
  [openPanel, closePanel, openGate].forEach((m) => m.mockClear());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("RoamShell: the tabs and panes", () => {
  it("shows the Roam pane, with the Chat pane held back until the browser is idle", async () => {
    vi.useFakeTimers();
    shell();
    expect(screen.getByTestId("roam-surface")).toBeTruthy();
    expect(screen.queryByTestId("group-surface")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByTestId("group-surface")).toBeTruthy();
    expect(screen.getByTestId("group-surface").closest("[aria-hidden]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("links the tabs to their own pages and marks the one you are on", () => {
    shell();
    const tabs = within(screen.getByRole("group", { name: "Conversation" }));
    expect(tabs.getByRole("button", { name: "Roam" }).dataset.href).toBe(`/trips/${TRIP}/chat`);
    expect(tabs.getByRole("button", { name: "Chat" }).dataset.href).toBe(`/trips/${TRIP}/group`);
    expect(tabs.getByRole("button", { name: "Roam" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches panes the moment a tab is clicked, mounting the chat at once", async () => {
    const user = u();
    shell();
    await user.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByRole("button", { name: "Chat" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("group-surface").dataset.active).toBe("true");
    expect(screen.getByTestId("members")).toBeTruthy();
    // Before the idle mount, leaving the Roam pane unmounts it (it comes back from its cache when you return).
    expect(screen.queryByTestId("roam-surface")).toBeNull();
  });

  it("keeps the Roam pane, hidden, once the Chat pane has been warmed up", async () => {
    vi.useFakeTimers();
    shell();
    await act(async () => { vi.advanceTimersByTime(1600); });
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByTestId("roam-surface").closest("[aria-hidden]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows the address when it changes underneath", () => {
    const view = shell("roam");
    view.rerender(<RoamShell tripId={TRIP} activeTab="group" />);
    expect(screen.getByRole("button", { name: "Chat" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("starts on the Chat pane when that is the page", () => {
    shell("group");
    expect(screen.getByTestId("group-surface").dataset.active).toBe("true");
    expect(screen.queryByTestId("members")).toBeTruthy();
  });

  it("never mounts the group chat for a guest, even on its page", () => {
    guest = true;
    shell("group");
    expect(screen.queryByTestId("group-surface")).toBeNull();
  });

  it("asks a guest for an account instead of opening the group chat, and never mounts it", async () => {
    guest = true;
    const user = u();
    shell();
    const chat = screen.getByRole("button", { name: "Chat, needs an account" });
    expect(chat.dataset.locked).toBe("true");
    await user.click(chat);
    expect(openGate).toHaveBeenCalledWith("chat with your group");
    expect(screen.getByRole("button", { name: "Roam" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("group-surface")).toBeNull();
  });
});

describe("RoamShell: opening things from the chat", () => {
  it("opens a place, a stay (with a way to ask Roam), an event, a collection or any panel", () => {
    shell();
    const ask = vi.fn();
    conv.onOpenPlace({ providerId: "p1", name: "Louvre" });
    expect(openPanel).toHaveBeenLastCalledWith({ kind: "place", placeId: "p1", name: "Louvre" });
    conv.onOpenStay({ hotelId: "h1", name: "Hotel" }, { checkin: "a", checkout: "b", adults: 2 }, ask);
    expect(openPanel).toHaveBeenLastCalledWith({ kind: "stay", hotelId: "h1", name: "Hotel", checkin: "a", checkout: "b", adults: 2, onAsk: ask });
    conv.onOpenEvent({ name: "Jazz" });
    expect(openPanel).toHaveBeenLastCalledWith({ kind: "event", seed: { name: "Jazz" } });
    conv.onOpenCollection("Cafés", { type: "place_list", places: [] });
    expect(openPanel).toHaveBeenLastCalledWith({ kind: "collection", title: "Cafés", block: { type: "place_list", places: [] } });
    expect(conv.onOpenPanel).toBe(openPanel);
  });

  it("keeps the handlers it hands the chat the same from render to render", () => {
    const view = shell();
    const first = conv.onOpenPlace;
    view.rerender(<RoamShell tripId={TRIP} activeTab="group" />);
    expect(conv.onOpenPlace).toBe(first);
  });

  it("tells Roam what is open beside the chat, except a comparison", () => {
    panel = { kind: "place" };
    shell();
    expect(screen.getByTestId("roam-surface").dataset.view).toBe("title:place");
    cleanup();
    panel = { kind: "compare" };
    shell();
    expect(screen.getByTestId("roam-surface").dataset.view).toBe("");
  });
});

describe("RoamShell: on a wide screen", () => {
  it("shows the trip context beside the chat", () => {
    shell();
    expect(screen.getByTestId("context")).toBeTruthy();
    expect(grid().style.gridTemplateColumns).toBe("calc(100% - 340px) 340px");
    expect(screen.getByRole("button", { name: "Hide trip context" })).toBeTruthy();
    expect(screen.queryByTestId("trip-panel")).toBeNull();
  });

  it("folds the context into a slim rail and opens it again", async () => {
    const user = u();
    shell();
    await user.click(screen.getByRole("button", { name: "Hide trip context" }));
    expect(screen.queryByTestId("context")).toBeNull();
    expect(grid().style.gridTemplateColumns).toBe("calc(100% - 48px) 48px");
    await user.click(screen.getByRole("button", { name: "Show trip context" }));
    expect(screen.getByTestId("context")).toBeTruthy();
  });

  it("gives the column to a detail panel when one is open, and narrows the chat's text", () => {
    panel = { kind: "place" };
    shell();
    expect(screen.getByTestId("trip-panel")).toBeTruthy();
    expect(screen.queryByTestId("context")).toBeNull();
    expect(grid().style.gridTemplateColumns).toBe("calc(100% - min(720px, max(0px, calc(100vw - 776px)))) min(720px, max(0px, calc(100vw - 776px)))");
    expect(screen.getByTestId("roam-surface").dataset.rail).toBe("true");
    expect(conv.rail).toBe(true);
    expect(group.rail ?? true).toBe(true);
  });

  it("has no tab-row button for the context, since the rail has its own", () => {
    shell();
    expect(screen.queryByRole("button", { name: "Show trip context" })).toBeNull();
  });
});

describe("RoamShell: on a narrow screen", () => {
  beforeEach(() => { desktop = false; });

  it("shows a detail panel over the conversation", () => {
    panel = { kind: "place" };
    shell();
    expect(screen.getByTestId("trip-panel")).toBeTruthy();
    expect(conv.rail).toBe(false);
  });

});

describe("RoamShell: the phone's header", () => {
  beforeEach(() => { desktop = false; });

  it("titles the page by the pane and has no floating tab row", async () => {
    const user = u();
    shell();
    expect(header.title).toBe("Roam");
    expect(screen.queryByRole("group", { name: "Conversation" })).toBeNull();
    cleanup();
    shell("group");
    expect(header.title).toBe("Group chat");
    void user;
  });

  it("opens the trip context from the round button on the Roam screen", async () => {
    const user = u();
    shell();
    const { container } = render(<>{header.trailing}</>);
    await user.click(within(container).getByRole("button", { name: "Trip context" }));
    expect(screen.getByRole("dialog", { name: "Trip context" })).toBeTruthy();
  });

  it("offers group settings and trip context from the Chat screen's button", async () => {
    const user = u();
    shell("group");
    const { container } = render(<>{header.trailing}</>);
    await user.click(within(container).getByRole("button", { name: "Group options" }));
    const menu = screen.getByRole("dialog", { name: "Group options" });
    expect(within(menu).getByRole("link", { name: /Group settings/ }).getAttribute("href")).toBe(`/trips/${TRIP}/group/details`);
    await user.click(within(menu).getByRole("button", { name: /Trip context/ }));
    expect(screen.queryByRole("dialog", { name: "Group options" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Trip context" })).toBeTruthy();
  });

  it("gives a guest no group button", () => {
    guest = true;
    shell("roam");
    cleanup();
    shell("group");
    expect(header.trailing).toBeUndefined();
  });

  it("puts a detail panel in a sheet over a scrim that closes it", async () => {
    sheetPanel = true;
    panel = { kind: "place" };
    shell();
    expect(screen.getByTestId("trip-panel")).toBeTruthy();
    const scrim = document.querySelector(".bg-black\\/40") as HTMLElement;
    fireEvent.click(scrim);
    expect(closePanel).toHaveBeenCalled();
  });
});
