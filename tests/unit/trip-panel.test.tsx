// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the shared trip side panel: when it shows, what its header links to, the comparison table and
 * Roam's take on it, and the small chat under it. Detail views and the network are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Entry = { id: string; kind: "place" | "stay" | "event" | "route"; name: string; subtitle?: string; href?: string; attrs: Record<string, unknown> };
let ctx: null | Record<string, unknown>;
let pathname = "/trips/x/itinerary";
let desktop = true;
let guestState = { guest: false };
let tripData: { tripId: string; data: { decisions: unknown[] } };
const openGate = vi.fn();

vi.mock("@/components/TripPanelProvider", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/components/TripPanelProvider")>()), useTripPanelMaybe: () => ctx }));
vi.mock("@/components/TripDataProvider", () => ({ useTripData: () => tripData }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest: guestState.guest, openGate }) }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLinkStatus: () => ({ pending: false }) }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => desktop }));
vi.mock("@/lib/phone-v2", () => ({ PHONE_V2: false }));
vi.mock("@/components/motion-primitives", () => ({
  ContentSwap: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Sheet: ({ open, children, ariaLabel }: { open: boolean; children: React.ReactNode; ariaLabel?: string }) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null),
}));
vi.mock("@/features/conversation/ui/blocks/ui", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span data-badge>{children}</span>, controlGhost: "", textAction: "" }));
vi.mock("@/features/conversation/ui/blocks/MessageBlocks", () => ({ MessageBlocks: () => <div>COLLECTION BLOCKS</div> }));
vi.mock("@/features/conversation/ui/AssistantMessage", () => ({ AssistantMessage: ({ content }: { content: string }) => <div data-testid="assistant">{content}</div> }));
vi.mock("@/features/places/ui/PlaceDetailView", () => ({ PlaceDetailView: ({ placeId }: { placeId: string }) => <div>PLACE {placeId}</div> }));
vi.mock("@/features/stays/ui/StayDetailView", () => ({ StayDetailView: ({ hotelId }: { hotelId: string }) => <div>STAY {hotelId}</div> }));
vi.mock("@/features/events/ui/EventDetailView", () => ({ EventDetailView: () => <div>EVENT</div> }));
vi.mock("@/features/conversation/ui/panels/FlightDetail", () => ({ FlightDetail: () => <div>FLIGHT</div> }));
vi.mock("@/features/conversation/ui/panels/DayDetail", () => ({ DayDetail: () => <div>DAY</div> }));
vi.mock("@/features/conversation/ui/panels/BudgetDetail", () => ({ BudgetDetail: () => <div>BUDGET</div> }));
vi.mock("@/features/conversation/ui/panels/RouteDetail", () => ({ RouteDetail: () => <div>ROUTE</div> }));
vi.mock("@/features/conversation/ui/panels/AreaDetail", () => ({ AreaDetail: () => <div>AREA</div> }));
vi.mock("@/features/conversation/ui/panels/MapDetail", () => ({ MapDetail: () => <div>MAP</div> }));
vi.mock("@/features/conversation/ui/panels/WeatherDetail", () => ({ WeatherDetail: () => <div>WEATHER</div> }));
vi.mock("@/features/conversation/ui/panels/ChecklistDetail", () => ({ ChecklistDetail: () => <div>CHECKLIST</div> }));
vi.mock("@/components/PanelStates", () => ({ PanelLoading: () => <div>LOADING</div> }));
vi.mock("@/features/places/application/placeDetailsCache", () => ({ readPlaceSeed: () => null }));

import { TripPanel } from "../../components/TripPanel";

type Call = { method: string; url: string; body?: { items: Array<Record<string, unknown>>; messages: Array<{ role: string; content: string }> } };
let calls: Call[];
let answer: string | "fail";
const answers = () => calls.filter((c) => c.url.endsWith("/compare-chat"));

const base = () => ({ closePanel: vi.fn(), openPanel: vi.fn(), openCompare: vi.fn(), compareClear: vi.fn(), compareRemove: vi.fn(), goBack: vi.fn(), canGoBack: false, navDirection: "forward", compareMode: false, compareList: [] as Entry[], panel: null as unknown });
const entry = (id: string, name: string, attrs: Record<string, unknown> = {}, kind: Entry["kind"] = "place"): Entry => ({ id, kind, name, attrs, href: `/trips/${TRIP}/place/${id}` });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  ctx = base();
  pathname = "/trips/x/itinerary";
  desktop = true;
  guestState = { guest: false };
  tripData = { tripId: TRIP, data: { decisions: [] } };
  answer = "Pick the first one.";
  calls = [];
  openGate.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return answer === "fail" ? new Response("{}", { status: 500 }) : new Response(answer, { status: 200 });
  }));
  Element.prototype.scrollTo = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TripPanel: when it shows", () => {
  it("shows nothing without a panel provider", () => {
    ctx = null;
    const { container } = render(<TripPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("stands down on the chat routes that host their own inline panel (the drawer only)", () => {
    ctx = { ...base(), panel: { kind: "place", placeId: "p1", name: "Louvre" } };
    pathname = "/trips/x/chat";
    const { container } = render(<TripPanel />);
    expect(container.innerHTML).toBe("");
    cleanup();
    pathname = "/trips/x/group";
    expect(render(<TripPanel />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<TripPanel layout="inline" />).container.querySelector('[role="complementary"]')).toBeTruthy();
  });

  it("keeps the drawer closed until a panel is opened", () => {
    render(<TripPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers a Compare pill while picking cards, to open or clear the comparison", async () => {
    ctx = { ...base(), compareMode: true, compareList: [entry("a", "A"), entry("b", "B")] };
    const user = u();
    render(<TripPanel />);
    expect(screen.getByText("Compare 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect((ctx as ReturnType<typeof base>).openCompare).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear comparison" }));
    expect((ctx as ReturnType<typeof base>).compareClear).toHaveBeenCalled();
  });

  it("hides the pill once the comparison is open", () => {
    ctx = { ...base(), compareMode: true, compareList: [entry("a", "A"), entry("b", "B")], panel: { kind: "compare" } };
    render(<TripPanel />);
    expect(screen.queryByText("Compare 2")).toBeNull();
  });
});

describe("TripPanel: the detail views and the header", () => {
  const open = (panel: unknown, over: Record<string, unknown> = {}) => { ctx = { ...base(), panel, ...over }; return render(<TripPanel />); };

  it("shows the place with its name as the title and a link to its full page", () => {
    open({ kind: "place", placeId: "p 1", name: "Louvre" });
    const dialog = screen.getByRole("dialog", { name: "Louvre" });
    expect(within(dialog).getByText("PLACE p 1")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Open as full page" }).getAttribute("href")).toBe(`/trips/${TRIP}/place/p%201`);
  });

  it("links a stay to its full page with the dates", () => {
    open({ kind: "stay", hotelId: "h/1", name: "Hotel", checkin: "2026-12-01", checkout: "2026-12-05" });
    expect(screen.getByRole("link", { name: "Open as full page" }).getAttribute("href")).toBe(`/trips/${TRIP}/stay/h%2F1?checkin=2026-12-01&checkout=2026-12-05`);
    cleanup();
    open({ kind: "stay", hotelId: "h1", name: "Hotel" });
    expect(screen.getByRole("link", { name: "Open as full page" }).getAttribute("href")).toBe(`/trips/${TRIP}/stay/h1`);
  });

  it("links an event to its full page with what describes it", () => {
    open({ kind: "event", seed: { name: "Jazz", url: "https://t/1", source: "tm", date: "2026-12-02", venue: "Blue Note", imageUrl: "https://img/1.jpg" } });
    const href = screen.getByRole("link", { name: "Open as full page" }).getAttribute("href")!;
    expect(href.startsWith(`/trips/${TRIP}/event?`)).toBe(true);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(Object.fromEntries(qs)).toEqual({ name: "Jazz", url: "https://t/1", source: "tm", img: "https://img/1.jpg", date: "2026-12-02", venue: "Blue Note" });
  });

  it("links collections and maps to the screens that show more of them", () => {
    open({ kind: "collection", title: "top sights", block: { type: "place_list", places: [] } });
    expect(screen.getByRole("link", { name: "Open as full page" }).getAttribute("href")).toBe(`/trips/${TRIP}/discover`);
    expect(screen.getByText("COLLECTION BLOCKS")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Top sights");
    cleanup();
    open({ kind: "map", title: "Map", points: [] });
    expect(screen.getByRole("link", { name: "Open as full page" }).getAttribute("href")).toBe(`/trips/${TRIP}/map`);
  });

  it("closes with the close button, and goes back when there is somewhere to go back to", async () => {
    const user = u();
    open({ kind: "place", placeId: "p1", name: "Louvre" }, { canGoBack: true });
    await user.click(screen.getByRole("button", { name: "Back to previous item" }));
    expect((ctx as ReturnType<typeof base>).goBack).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect((ctx as ReturnType<typeof base>).closePanel).toHaveBeenCalled();
  });

  it("closes the panel when the expand link points at the page already open", async () => {
    window.history.pushState({}, "", `/trips/${TRIP}/discover`);
    const user = u();
    open({ kind: "collection", title: "x", block: { type: "place_list", places: [] } });
    const link = screen.getByRole("link", { name: "Open as full page" });
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    expect((ctx as ReturnType<typeof base>).closePanel).toHaveBeenCalled();
  });
});

describe("TripPanel: comparing", () => {
  const compare = (list: Entry[], over: Record<string, unknown> = {}) => { ctx = { ...base(), panel: { kind: "compare" }, compareList: list, ...over }; return render(<TripPanel />); };
  const a = entry("a", "Cafe A", { price: "€10", priceValue: 10, rating: "4.2", ratingValue: 4.2, address: "1 Rue A", detail: "Cafe" });
  const b = entry("b", "Cafe B", { price: "€14", priceValue: 14, rating: "4.8", ratingValue: 4.8, address: "2 Rue B", detail: "Cafe" });

  it("lays the options out side by side and marks the cheapest and the best rated", async () => {
    compare([a, b]);
    await screen.findByText("Cafe A");
    const labels = Array.from(document.querySelectorAll(".col-span-full > div:first-child")).map((e) => e.textContent);
    expect(labels).toEqual(["Type", "Price", "Rating", "Address"]);
    const badges = Array.from(document.querySelectorAll("[data-badge]")).map((e) => e.textContent);
    expect(badges).toEqual(["Lowest", "Top"]);
    expect(screen.getByText("€10").parentElement!.querySelector("[data-badge]")?.textContent).toBe("Lowest");
    expect(screen.getByText("4.8").parentElement!.querySelector("[data-badge]")?.textContent).toBe("Top");
  });

  it("does not crown a cheapest or best when the options are different kinds", async () => {
    compare([a, entry("s", "Hotel", { price: "€90", priceValue: 90, rating: "9", ratingValue: 9 }, "stay")]);
    await screen.findByText("Cafe A");
    expect(document.querySelectorAll("[data-badge]")).toHaveLength(0);
  });

  it("drops a row that would be a dash for every option", async () => {
    compare([entry("a", "A", { price: "€10", priceValue: 10 }), entry("b", "B", { price: "€12", priceValue: 12 })]);
    await screen.findByText("A");
    const labels = Array.from(document.querySelectorAll(".col-span-full > div:first-child")).map((e) => e.textContent);
    expect(labels).toEqual(["Type", "Price"]);
  });

  it("adds the distance from the booked stay, in metres or kilometres", async () => {
    tripData = { tripId: TRIP, data: { decisions: [{ kind: "stay", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel Lutetia", roomName: "R", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-05", nights: 4, nightlyAmount: 1, totalAmount: 4, currency: "EUR", latitude: 48.85, longitude: 2.35, address: null, thumbnail: null } }] } };
    compare([entry("near", "Near", { lat: 48.8505, lng: 2.35 }), entry("mid", "Mid", { lat: 48.854, lng: 2.35 }), entry("far", "Far", { lat: 48.9, lng: 2.35 })]);
    await screen.findByText("Near");
    expect(screen.getByText(/^4\d\d m$/)).toBeTruthy();
    expect(screen.getByText("From Hotel Lutetia")).toBeTruthy();
    expect(screen.getByText(/^[1-9]\d? m$/)).toBeTruthy();
    expect(screen.getByText(/^\d+\.\d km$/)).toBeTruthy();
  });

  it("removes an option, and explains an empty comparison", async () => {
    const user = u();
    compare([a, b]);
    await user.click(screen.getByRole("button", { name: "Remove Cafe A" }));
    expect((ctx as ReturnType<typeof base>).compareRemove).toHaveBeenCalledWith("a");
    cleanup();
    compare([]);
    expect(screen.getByText(/Pick a few cards to compare/)).toBeTruthy();
  });

  it("asks Roam for its take as soon as two options are being compared, and shows it above the numbers", async () => {
    compare([a, b]);
    const take = await screen.findByLabelText("Roam’s take");
    await waitFor(() => expect(within(take).getByTestId("assistant").textContent).toBe("Pick the first one."));
    expect(answers()).toHaveLength(1);
    expect(answers()[0].body!.messages).toEqual([{ role: "user", content: "Which of these should I pick, and why? One short paragraph." }]);
    expect(answers()[0].body!.items.map((i) => i.name)).toEqual(["Cafe A", "Cafe B"]);
    expect(answers()[0].body!.items[0]).toMatchObject({ price: "€10", rating: "4.2", address: "1 Rue A" });
  });

  it("does not ask with fewer than two options", () => {
    compare([a]);
    expect(answers()).toHaveLength(0);
  });

  it("offers Try again when Roam's take could not be fetched", async () => {
    answer = "fail";
    compare([a, b]);
    const take = await screen.findByLabelText("Roam’s take");
    await waitFor(() => expect(take.textContent).toContain("Roam couldn’t answer just now."));
    expect(within(take).getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  // Known bug: Try again appends a second exchange, but the take above the numbers keeps showing the first (failed) answer.
  it.fails("replaces a failed take with the answer from Try again", async () => {
    answer = "fail";
    const user = u();
    compare([a, b]);
    const take = await screen.findByLabelText("Roam’s take");
    await waitFor(() => expect(take.textContent).toContain("Roam couldn’t answer just now."));
    answer = "A second try works.";
    await user.click(within(take).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(screen.getByLabelText("Roam’s take")).getByTestId("assistant").textContent).toBe("A second try works."));
  });

  it("asks nothing for a guest, and asks them to save the trip", async () => {
    guestState = { guest: true };
    compare([a, b]);
    await waitFor(() => expect(openGate).toHaveBeenCalledWith("ask Roam to compare options"));
    expect(answers()).toHaveLength(0);
  });
});

describe("TripPanel: asking about the open item", () => {
  const openPlace = () => { ctx = { ...base(), panel: { kind: "place", placeId: "p1", name: "Louvre" } }; return render(<TripPanel />); };

  it("sends a question with what is on screen, and shows the question and the streamed answer", async () => {
    const user = u();
    openPlace();
    await user.type(screen.getByLabelText("Ask about this item"), "Is it open late?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(answers()).toHaveLength(1));
    expect(answers()[0].body).toEqual({ items: [{ name: "Louvre", detail: "Place" }], messages: [{ role: "user", content: "Is it open late?" }] });
    expect(await screen.findByText("Is it open late?")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("assistant").textContent).toBe("Pick the first one."));
  });

  it("carries the earlier turns of the chat into the next question", async () => {
    const user = u();
    openPlace();
    await user.type(screen.getByLabelText("Ask about this item"), "First?");
    await user.keyboard("{Enter}");
    await screen.findByTestId("assistant");
    await user.type(screen.getByLabelText("Ask about this item"), "Second?");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(answers()).toHaveLength(2));
    expect(answers()[1].body!.messages).toEqual([{ role: "user", content: "First?" }, { role: "assistant", content: "Pick the first one." }, { role: "user", content: "Second?" }]);
  });

  it("ignores an empty question, and says Roam couldn't answer when the call fails", async () => {
    const user = u();
    openPlace();
    await user.type(screen.getByLabelText("Ask about this item"), "   ");
    await user.keyboard("{Enter}");
    expect(answers()).toHaveLength(0);
    answer = "fail";
    await user.type(screen.getByLabelText("Ask about this item"), "Why?");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Roam couldn’t answer just now. Try again in a moment.")).toBeTruthy();
  });

  it("clears the chat on request", async () => {
    const user = u();
    openPlace();
    await user.type(screen.getByLabelText("Ask about this item"), "Hi?");
    await user.keyboard("{Enter}");
    await screen.findByTestId("assistant");
    await user.click(screen.getByRole("button", { name: "Clear this chat" }));
    expect(screen.queryByText("Hi?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear this chat" })).toBeNull();
  });

  it("asks a guest to save the trip instead of sending", async () => {
    guestState = { guest: true };
    const user = u();
    openPlace();
    await user.type(screen.getByLabelText("Ask about this item"), "Hi?");
    await user.keyboard("{Enter}");
    expect(openGate).toHaveBeenCalledWith("ask Roam to compare options");
    expect(answers()).toHaveLength(0);
  });

  it("has no question box on a 'See all' list", () => {
    ctx = { ...base(), panel: { kind: "collection", title: "x", block: { type: "place_list", places: [] } } };
    render(<TripPanel />);
    expect(screen.queryByLabelText("Ask about this item")).toBeNull();
  });
});

describe("TripPanel: docked beside the chat", () => {
  it("renders in its own column with no question box, and closes on Escape", async () => {
    ctx = { ...base(), panel: { kind: "place", placeId: "p1", name: "Louvre" } };
    render(<TripPanel layout="inline" />);
    const panel = screen.getByRole("complementary", { name: "Louvre" });
    expect(within(panel).getByText("PLACE p1")).toBeTruthy();
    expect(screen.queryByLabelText("Ask about this item")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect((ctx as ReturnType<typeof base>).closePanel).toHaveBeenCalled();
  });

  it("leaves Escape to an open dialog or menu on top of it", () => {
    ctx = { ...base(), panel: { kind: "place", placeId: "p1", name: "Louvre" } };
    render(<TripPanel layout="inline" />);
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect((ctx as ReturnType<typeof base>).closePanel).not.toHaveBeenCalled();
    menu.remove();
  });

  it("moves focus into the panel when it opens", () => {
    ctx = { ...base(), panel: { kind: "place", placeId: "p1", name: "Louvre" } };
    render(<TripPanel layout="inline" />);
    expect(document.activeElement).toBe(screen.getByRole("complementary"));
  });
});

