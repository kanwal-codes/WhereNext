// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the signed-in home: the list of trips (featured card, filter tabs, phone rows), starting a trip from
 * the prompt box (typed, a suggestion chip, or dictated), and deleting or leaving a trip. Cards, the hero photo and the account menu are faked.
 */
type Any = Record<string, any>;
const NOW = new Date("2026-10-20T12:00:00");
let phoneV2 = false;
let wide = true;
let speech: Any;
let speechOpts: Any = {};
const toast = vi.fn();
const assign = vi.fn();

vi.mock("@/lib/phone-v2", () => ({ get PHONE_V2() { return phoneV2; } }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => wide }));
vi.mock("@/lib/use-speech-input", () => ({ useSpeechInput: (opts: Any) => { speechOpts = opts; return speech; } }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }: Any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: ({ variant }: Any) => <span>{`brand ${variant}`}</span> }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: ({ displayName }: Any) => <div data-testid="account">{displayName}</div> }));
vi.mock("@/components/HeroCarousel", () => ({ HeroCarousel: ({ children }: Any) => <section data-testid="hero">{children}</section> }));
vi.mock("@/features/roam/ui/RoamMark", () => ({ RoamMark: () => <i data-testid="roam-mark" /> }));
vi.mock("@/components/motion-primitives", () => ({
  Reveal: ({ children }: Any) => <div>{children}</div>,
  Stagger: ({ children, className }: Any) => <div data-testid="grid" className={className}>{children}</div>,
  StaggerItem: ({ children }: Any) => <div>{children}</div>,
  WordReveal: ({ text }: Any) => <h1>{text}</h1>,
  Sheet: ({ open, children, ariaLabel }: Any) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null),
}));
vi.mock("@/components/trips/FeaturedTrip", () => ({ FeaturedTrip: ({ trip, status, deleting, onDelete }: Any) => <article data-testid="featured" data-deleting={String(deleting)}>{`featured ${trip.name} ${status.badge}`}<button type="button" onClick={onDelete}>{`delete ${trip.name}`}</button></article> }));
vi.mock("@/components/trips/TripCard", () => ({ TripCard: ({ trip, status, deleting, onDelete }: Any) => <article data-testid="card" data-deleting={String(deleting)}>{`card ${trip.name} ${status.badge}`}<button type="button" onClick={onDelete}>{`delete ${trip.name}`}</button></article> }));
vi.mock("@/components/trips/PhoneTripRow", () => ({ PhoneTripRow: ({ trip, onDelete }: Any) => <article data-testid="row">{`row ${trip.name}`}<button type="button" onClick={onDelete}>{`remove ${trip.name}`}</button></article> }));

import { TripsHome } from "../../components/TripsHome";

const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const trip = (id: string, name: string, over: Any = {}) => ({ id, name, destination: null, origin: null, duration_days: null, start_date: null, end_date: null, travelers: null, ...over });
const soon = (id: string, name: string, n = 10, over: Any = {}) => trip(id, name, { start_date: day(n), end_date: day(n + 4), ...over });
const old = (id: string, name: string, over: Any = {}) => trip(id, name, { start_date: day(-40), end_date: day(-36), ...over });
const now = (id: string, name: string, over: Any = {}) => trip(id, name, { start_date: day(-1), end_date: day(3), ...over });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const home = (trips: Any[], props: Any = {}) => render(<TripsHome trips={trips as never} displayName="Kanwal" userId="user-1" {...props} />);
const input = () => screen.getByLabelText("Tell Roam about your next trip") as HTMLInputElement;

let fetchCalls: Array<{ url: string; init?: RequestInit }>;
let respond: (url: string, init?: RequestInit) => Response | Promise<Response>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  phoneV2 = false; wide = true; speechOpts = {};
  speech = { supported: false, listening: false, toggle: vi.fn() };
  toast.mockClear(); assign.mockClear();
  fetchCalls = [];
  respond = () => new Response(JSON.stringify({ trip: { id: "new-1" } }), { status: 200 });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { fetchCalls.push({ url: String(url), init }); return respond(String(url), init); }));
  vi.stubGlobal("location", { assign });
  let n = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `key-${++n}` });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("TripsHome: the page", () => {
  it("greets with the account menu and the prompt, whatever the trips", () => {
    home([]);
    expect(screen.getByTestId("account").textContent).toBe("Kanwal");
    expect(screen.getByRole("heading", { name: "Trips you’re thinking about." })).toBeTruthy();
    expect(input()).toBeTruthy();
    expect(screen.getByRole("link", { name: /brand compact/ }).getAttribute("href")).toBe("/");
  });

  it("invites a first trip when there are none", () => {
    home([]);
    expect(screen.getByRole("heading", { name: "No trips yet" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Start with a place/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create your first trip/ }).getAttribute("href")).toBe("/trips/new");
    expect(screen.queryByTestId("featured")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByTestId("roam-mark")).toBeTruthy();
  });

  it("counts the trips and links to making a new one", () => {
    home([soon("a", "Lisbon"), old("b", "Rome")]);
    expect(screen.getByRole("heading", { name: "Your trips" })).toBeTruthy();
    expect(screen.getByText("2", { selector: ".daisy-badge" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create new trip/ }).getAttribute("href")).toBe("/trips/new");
    expect(screen.queryByRole("heading", { name: /Start with a place/ })).toBeNull();
  });
});

describe("TripsHome: which trip leads", () => {
  it("features what is happening now, then everything else in home order", () => {
    home([old("p", "Rome"), soon("s", "Lisbon", 30), now("n", "Oslo"), soon("c", "Porto", 5), trip("u", "Someday")]);
    expect(screen.getByTestId("featured").textContent).toContain("featured Oslo Underway");
    expect(screen.getAllByTestId("card").map((c) => c.textContent?.replace(/delete.*/, ""))).toEqual([
      "card Porto In 5 days", "card Lisbon In 4 weeks", "card Someday Planning", "card Rome Past",
    ]);
  });

  it("features the soonest upcoming trip when nothing is under way", () => {
    home([soon("a", "Later", 60), soon("b", "Sooner", 3)]);
    expect(screen.getByTestId("featured").textContent).toContain("featured Sooner In 3 days");
  });

  it("features a trip still being planned, then a past one", () => {
    home([old("p", "Rome"), trip("u", "Someday")]);
    expect(screen.getByTestId("featured").textContent).toContain("featured Someday");
    cleanup();
    home([old("p", "Rome")]);
    expect(screen.getByTestId("featured").textContent).toContain("featured Rome Past");
    expect(screen.queryByTestId("grid")).toBeNull();
  });

  it("lays the rest out two across for one, two or four, three across otherwise", () => {
    const cols = (n: number) => {
      cleanup();
      home([now("n", "Lead"), ...Array.from({ length: n }, (_, i) => soon(`s${i}`, `T${i}`, 10 + i))]);
      return screen.getByTestId("grid").className;
    };
    expect(cols(1)).toContain("lg:grid-cols-2");
    expect(cols(2)).toContain("lg:grid-cols-2");
    expect(cols(3)).toContain("lg:grid-cols-3");
    expect(cols(4)).toContain("lg:grid-cols-2");
    expect(cols(5)).toContain("lg:grid-cols-3");
  });
});

describe("TripsHome: filter tabs", () => {
  const many = () => [now("n", "Oslo"), soon("s1", "Lisbon", 20), soon("s2", "Porto", 30), old("p", "Rome"), trip("u", "Someday")];

  it("appear only with more than three trips and more than one kind", () => {
    home([soon("a", "A"), soon("b", "B"), soon("c", "C")]);
    expect(screen.queryByRole("tablist")).toBeNull();
    cleanup();
    home([soon("a", "A"), soon("b", "B"), soon("c", "C"), soon("d", "D")]);
    expect(screen.queryByRole("tablist")).toBeNull(); // one kind only
    cleanup();
    home(many());
    expect(screen.getByRole("tablist", { name: "Filter trips" })).toBeTruthy();
  });

  it("count each kind, with underway folded into Upcoming, and leave out kinds with none", () => {
    home(many());
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["All5", "Upcoming3", "Planning1", "Past1"]);
    cleanup();
    home([soon("a", "A"), soon("b", "B"), soon("c", "C"), old("p", "Rome")]);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent)).toEqual(["All4", "Upcoming3", "Past1"]);
  });

  it("narrow the list to one kind and mark the chosen tab", async () => {
    const user = u();
    home(many());
    expect(screen.getByRole("tab", { name: /All/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: /Past/ }));
    expect(screen.getByRole("tab", { name: /Past/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /All/ }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("featured").textContent).toContain("Rome");
    expect(screen.queryAllByTestId("card")).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: /Upcoming/ }));
    expect(screen.getByTestId("featured").textContent).toContain("Oslo");
    expect(screen.getAllByTestId("card")).toHaveLength(2);
  });

  it("fall back to All when the last trip of the open kind is deleted", async () => {
    const user = u();
    vi.useRealTimers();
    respond = () => new Response("{}", { status: 200 });
    home(many());
    await user.click(screen.getByRole("tab", { name: /Past/ }));
    await user.click(screen.getByRole("button", { name: "delete Rome" }));
    await user.click(screen.getByRole("button", { name: /^Delete trip$/ }));
    await waitFor(() => expect(screen.queryByText(/Rome/)).toBeNull());
    expect(screen.getByRole("tab", { name: /All/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("featured").textContent).toContain("Oslo");
  });
});

describe("TripsHome: deleting and leaving", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("asks first, and keeps the trip when you change your mind", async () => {
    const user = u();
    home([soon("a", "Lisbon")]);
    await user.click(screen.getByRole("button", { name: "delete Lisbon" }));
    const dialog = screen.getByRole("dialog", { name: "Delete trip" });
    expect(within(dialog).getByText("Delete this trip?")).toBeTruthy();
    expect(within(dialog).getByText(/“Lisbon”/)).toBeTruthy();
    expect(within(dialog).getByText(/removed for everyone on the trip/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Keep trip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchCalls).toHaveLength(0);
    expect(screen.getByTestId("featured")).toBeTruthy();
  });

  it("deletes the trip for everyone when you own it", async () => {
    const user = u();
    respond = () => new Response("{}", { status: 200 });
    home([soon("a", "Lisbon"), soon("b", "Porto", 20)]);
    await user.click(screen.getAllByRole("button", { name: "delete Lisbon" })[0]);
    await user.click(screen.getByRole("button", { name: /^Delete trip$/ }));
    await waitFor(() => expect(screen.queryByText(/Lisbon/)).toBeNull());
    expect(fetchCalls).toEqual([{ url: "/api/trips/a", init: { method: "DELETE" } }]);
    expect(toast).toHaveBeenCalledWith("\"Lisbon\" deleted.", "success");
    expect(screen.getByTestId("featured").textContent).toContain("Porto");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves a trip somebody else owns, without deleting it", async () => {
    const user = u();
    respond = () => new Response("{}", { status: 200 });
    home([soon("a", "Lisbon", 10, { is_owner: false })]);
    await user.click(screen.getByRole("button", { name: "delete Lisbon" }));
    const dialog = screen.getByRole("dialog", { name: "Leave trip" });
    expect(within(dialog).getByText("Leave this trip?")).toBeTruthy();
    expect(within(dialog).getByText(/is owned by someone else/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Leave trip" }));
    await waitFor(() => expect(screen.queryByText(/Lisbon/)).toBeNull());
    expect(fetchCalls[0].url).toBe("/api/trips/a/members/user-1");
    expect(fetchCalls[0].init).toEqual({ method: "DELETE" });
    expect(toast).toHaveBeenCalledWith("You left \"Lisbon\".", "success");
  });

  it("keeps the trip and says so when the server refuses", async () => {
    const user = u();
    respond = () => new Response("{}", { status: 500 });
    home([soon("a", "Lisbon")]);
    await user.click(screen.getByRole("button", { name: "delete Lisbon" }));
    await user.click(screen.getByRole("button", { name: /^Delete trip$/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That trip couldn’t be deleted. Try again.", "error"));
    expect(screen.getByTestId("featured")).toBeTruthy();
    expect(screen.getByTestId("featured").dataset.deleting).toBe("false");
  });

  it("says it could not leave, in the leaving words", async () => {
    const user = u();
    respond = () => new Response("{}", { status: 500 });
    home([soon("a", "Lisbon", 10, { is_owner: false })]);
    await user.click(screen.getByRole("button", { name: "delete Lisbon" }));
    await user.click(screen.getByRole("button", { name: "Leave trip" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("You couldn’t leave that trip. Try again.", "error"));
  });

  it("dims the card while the request is out", async () => {
    const user = u();
    let release!: () => void;
    respond = () => new Promise<Response>((resolve) => { release = () => resolve(new Response("{}", { status: 200 })); });
    home([soon("a", "Lisbon")]);
    await user.click(screen.getByRole("button", { name: "delete Lisbon" }));
    await user.click(screen.getByRole("button", { name: /^Delete trip$/ }));
    await waitFor(() => expect(screen.getByTestId("featured").dataset.deleting).toBe("true"));
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByTestId("featured")).toBeNull());
  });
});

describe("TripsHome: starting a trip", () => {
  beforeEach(() => { vi.useRealTimers(); });
  const send = () => screen.getByRole("button", { name: "Start planning" }) as HTMLButtonElement;

  it("can only be sent once something is typed", async () => {
    const user = u();
    home([]);
    expect(send().disabled).toBe(true);
    await user.type(input(), "   ");
    expect(send().disabled).toBe(true);
    await user.type(input(), "Lisbon");
    expect(send().disabled).toBe(false);
  });

  it("fills the box from a suggestion and puts the cursor in it", async () => {
    const user = u();
    home([]);
    await user.click(screen.getByRole("button", { name: "Somewhere new" }));
    expect(input().value).toBe("Somewhere new");
    expect(document.activeElement).toBe(input());
  });

  it("makes a blank trip and opens its chat with the words already in the composer", async () => {
    const user = u();
    home([]);
    await user.type(input(), "A long weekend & more");
    await user.click(send());
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(fetchCalls[0].url).toBe("/api/trips");
    expect(fetchCalls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({ destination: null, idempotencyKey: "key-1" });
    expect(assign).toHaveBeenCalledWith(`/trips/new-1/chat?ask=${encodeURIComponent("A long weekend & more")}`);
  });

  it("trims what was typed, and sends on Enter", async () => {
    const user = u();
    home([]);
    await user.type(input(), "  Oslo  {Enter}");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/trips/new-1/chat?ask=Oslo"));
  });

  it("disables the box while it works, and shows a spinner in place of the arrow", async () => {
    const user = u();
    let release!: () => void;
    respond = () => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify({ trip: { id: "t" } }), { status: 200 })); });
    home([]);
    await user.type(input(), "Oslo");
    await user.click(send());
    await waitFor(() => expect(input().disabled).toBe(true));
    expect(send().disabled).toBe(true);
    expect(send().querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Somewhere new" })).toBeTruthy();
    await act(async () => { release(); });
  });

  it("never makes two trips from a double submit", async () => {
    const user = u();
    respond = () => new Promise<Response>(() => {});
    home([]);
    await user.type(input(), "Oslo");
    const form = input().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    fireEvent.submit(form);
    expect(fetchCalls).toHaveLength(1);
  });

  it("says so when it could not start, and lets the next try reuse the same attempt", async () => {
    const user = u();
    respond = () => new Response("{}", { status: 500 });
    home([]);
    await user.type(input(), "Oslo");
    await user.click(send());
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn’t start that trip. Try again in a moment.");
    expect(screen.queryByRole("button", { name: "Somewhere new" })).toBeNull(); // the error stands in for the suggestions
    expect(input().disabled).toBe(false);
    respond = () => new Response(JSON.stringify({ trip: { id: "ok" } }), { status: 200 });
    await user.click(send());
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/trips/ok/chat?ask=Oslo"));
    expect(fetchCalls.map((c) => JSON.parse(String(c.init?.body)).idempotencyKey)).toEqual(["key-1", "key-1"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a reply with no trip id as a failure", async () => {
    const user = u();
    respond = () => new Response(JSON.stringify({}), { status: 200 });
    home([]);
    await user.type(input(), "Oslo");
    await user.click(send());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("treats a reply that is not JSON as a failure", async () => {
    const user = u();
    respond = () => new Response("<html>", { status: 200 });
    home([]);
    await user.type(input(), "Oslo");
    await user.click(send());
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("asks with a long prompt on a wide screen and a short one on a phone", () => {
    home([]);
    expect(input().placeholder).toMatch(/A long weekend in Lisbon/);
    cleanup();
    wide = false;
    home([]);
    expect(input().placeholder).toBe("Where to next?");
  });
});

describe("TripsHome: dictation", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("offers the microphone only where the browser can listen", () => {
    home([]);
    expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();
    cleanup();
    speech = { ...speech, supported: true };
    home([]);
    expect(screen.getByRole("button", { name: "Dictate" })).toBeTruthy();
  });

  it("starts and stops listening, saying which", async () => {
    const user = u();
    speech = { supported: true, listening: false, toggle: vi.fn() };
    home([]);
    await user.click(screen.getByRole("button", { name: "Dictate" }));
    expect(speech.toggle).toHaveBeenCalled();
    cleanup();
    speech = { supported: true, listening: true, toggle: vi.fn() };
    home([]);
    const stop = screen.getByRole("button", { name: "Stop dictation" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(input().placeholder).toBe("Listening…");
  });

  it("adds what is said after what was already typed", async () => {
    const user = u();
    speech = { supported: true, listening: false, toggle: vi.fn() };
    home([]);
    await user.type(input(), "Oslo ");
    act(() => speechOpts.onStart());
    act(() => speechOpts.onResult("in winter"));
    expect(input().value).toBe("Oslo in winter");
    act(() => speechOpts.onResult("in winter, cheap"));
    expect(input().value).toBe("Oslo in winter, cheap");
  });

  it("starts fresh when the box was empty", () => {
    speech = { supported: true, listening: false, toggle: vi.fn() };
    home([]);
    act(() => speechOpts.onStart());
    act(() => speechOpts.onResult("Rome"));
    expect(input().value).toBe("Rome");
  });

  it("tells the traveller when dictation fails", () => {
    speech = { supported: true, listening: false, toggle: vi.fn() };
    home([]);
    act(() => speechOpts.onError("Microphone access is blocked."));
    expect(toast).toHaveBeenCalledWith("Microphone access is blocked.", "error");
  });

  it("locks the microphone while a trip is being made", async () => {
    const user = u();
    speech = { supported: true, listening: false, toggle: vi.fn() };
    respond = () => new Promise<Response>(() => {});
    home([]);
    await user.type(input(), "Oslo");
    await user.click(screen.getByRole("button", { name: "Start planning" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Dictate" }) as HTMLButtonElement).disabled).toBe(true));
  });
});

describe("TripsHome: on the phone", () => {
  it("lists every trip as a row, and keeps the cards for wider screens", async () => {
    vi.useRealTimers();
    phoneV2 = true;
    home([now("n", "Oslo"), soon("s", "Lisbon"), old("p", "Rome")]);
    expect(screen.getAllByTestId("row").map((r) => r.textContent?.replace(/remove.*/, ""))).toEqual(["row Oslo", "row Lisbon", "row Rome"]);
    expect(document.querySelector('a[href="/trips/new"]')?.textContent?.trim()).toBe("Create New trip");
    const user = u();
    await user.click(screen.getByRole("button", { name: "remove Lisbon" }));
    expect(screen.getByRole("dialog", { name: "Delete trip" })).toBeTruthy();
    expect(screen.getByTestId("featured").closest(".max-lg\\:hidden")).toBeTruthy();
  });

  it("has no rows off the phone", () => {
    home([soon("s", "Lisbon")]);
    expect(screen.queryAllByTestId("row")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Create new trip" })).toBeTruthy();
  });
});
