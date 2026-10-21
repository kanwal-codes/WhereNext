// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the event detail (page and side panel): loading it, the facts, tickets, adding it to the trip and
 * the sections that appear only when the event has them. The fetch and the heavy neighbours are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let tripData: Any | null;
let guest = false;
let detailBody: Any | "fail" | "none";
let calls: string[];
let signals: AbortSignal[];
const openGate = vi.fn();
const mutate = vi.fn();
const toast = vi.fn();
let hero: Any = {};
let recs: Any | null = null;

vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => (tripData ? { data: tripData } : null) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest, openGate }) }));
vi.mock("@/lib/client/mutation-queue", () => ({ mutate: (...a: unknown[]) => mutate(...a) }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/lib/use-document-title", () => ({ useDocumentTitle: () => null }));
vi.mock("@/components/Hero", () => ({ Hero: (p: Any) => { hero = p; return <div data-testid="hero">{p.children}</div>; } }));
vi.mock("@/components/BackLink", () => ({ BackLink: ({ fallback }: Any) => <a href={fallback}>Back</a> }));
vi.mock("@/components/SourceCard", () => ({ SourceCard: ({ provider, href }: Any) => <a href={href}>{provider}</a> }));
vi.mock("@/components/NearbyRecommendations", () => ({ NearbyRecommendations: (p: Any) => { recs = p; return <div data-testid="recs" />; } }));
vi.mock("@/components/PanelStates", () => ({
  PANEL_PAD: "pad", PANEL_HERO: "hero",
  PanelLoading: ({ what }: Any) => <div>loading {what}</div>,
  PanelError: ({ what, onRetry, children }: Any) => <div><span>error {what}</span><button type="button" onClick={onRetry}>retry</button>{children}</div>,
}));
vi.mock("@/components/motion-primitives", () => ({
  Reveal: ({ children }: Any) => <div>{children}</div>, Stagger: ({ children, className }: Any) => <div className={className}>{children}</div>,
  StaggerItem: ({ children }: Any) => <div>{children}</div>, Tactile: ({ children }: Any) => <div>{children}</div>, WordReveal: ({ text }: Any) => <h1>{text}</h1>,
}));

import { EventDetailView } from "../../features/events/ui/EventDetailView";

const detail = (over: Any = {}) => ({
  title: "Jazz Night", source: "ticketmaster", url: "https://www.ticketmaster.com/e/1", imageUrl: "https://img/e.jpg", date: "2026-12-02 20:00", doorsTime: "19:00", showTime: "20:00", admission: "Seated",
  status: "onsale", venueName: "Blue Note", venueAddress: "131 W 3rd St, New York, NY", city: "New York", latitude: 40.73, longitude: -74, performers: ["Headliner", "Support A", "Support B"], lineupNote: null,
  genre: "Jazz", priceRange: "$40 – $90", onSale: "On sale 2026-10-01", promoter: "Live Nation", ageInfo: "18+", about: "# Heading\nTitle: Real title\nA night of jazz.\n\n\n\nMore.", whatToExpect: "Two sets.", pleaseNote: "No flash photography.", seatmapUrl: null,
  ticketOptions: [{ label: "Also on SeatGeek", url: "https://seatgeek.com/e/1" }], sources: [{ title: "Venue site", url: "https://bluenote.example" }], ...over,
});
const seed = { name: "Jazz Night", url: "https://www.ticketmaster.com/e/1", source: "ticketmaster", imageUrl: "https://img/seed.jpg", date: "2026-12-02 20:00", venue: "Blue Note" };
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const page = (props: Any = {}) => render(<EventDetailView tripId={TRIP} seed={seed} {...props} />);

beforeEach(() => {
  guest = false; tripData = { trip: { start_date: "2026-12-01" }, itinerary: [] };
  detailBody = detail(); calls = []; signals = []; hero = {}; recs = null;
  openGate.mockClear(); mutate.mockReset(); mutate.mockResolvedValue({ ok: true }); toast.mockClear();
  try { sessionStorage.clear(); } catch { /* */ }
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    calls.push(String(input));
    if (init?.signal) signals.push(init.signal);
    if (detailBody === "fail") return new Response("{}", { status: 500 });
    if (detailBody === "none") return new Response(JSON.stringify({ detail: null }), { status: 200 });
    return new Response(JSON.stringify({ detail: detailBody }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("EventDetailView: loading", () => {
  it("asks for the event by what the card knew, and shows a loading state first", async () => {
    page();
    expect(screen.getByText("loading this event")).toBeTruthy();
    await screen.findByRole("heading", { name: "Jazz Night" });
    const url = new URL(calls[0], "http://x");
    expect(url.pathname).toBe(`/api/trips/${TRIP}/events/detail`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ name: "Jazz Night", url: seed.url, source: "ticketmaster", img: "https://img/seed.jpg", date: "2026-12-02 20:00", venue: "Blue Note" });
  });

  it("leaves out what the card did not know", async () => {
    page({ seed: { name: "X", url: "u", source: "s" } });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect([...new URL(calls[0], "http://x").searchParams.keys()]).toEqual(["name", "url", "source"]);
  });

  it("reuses an event seen this session", async () => {
    const first = page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    first.unmount();
    page();
    expect(screen.getByRole("heading", { name: "Jazz Night" })).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("cancels the request when the page goes away", async () => {
    const view = page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(signals[0].aborted).toBe(false);
    view.unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it("offers a retry and the event's own page when the details cannot be loaded", async () => {
    detailBody = "fail";
    const user = u();
    page();
    expect(await screen.findByText("error the details for this event")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Jazz Night" })).toBeTruthy(); // the card's own name still heads the page
    expect(screen.getByRole("link", { name: /Open the event page/ }).getAttribute("href")).toBe(seed.url);
    detailBody = detail();
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("Two sets.")).toBeTruthy();
  });

  it("treats an answer with no detail as an error", async () => {
    detailBody = "none";
    page();
    expect(await screen.findByText("error the details for this event")).toBeTruthy();
  });

  it("offers no event page link when the seller is unknown", async () => {
    detailBody = "fail";
    page({ seed: { ...seed, url: "", source: "mystery" } });
    await screen.findByText("error the details for this event");
    expect(screen.queryByRole("link", { name: /Open the event page/ })).toBeNull();
  });
});

describe("EventDetailView: the top", () => {
  it("shows when, where and from what price", async () => {
    page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    const facts = document.querySelector("dl")!;
    expect(within(facts as HTMLElement).getByText("When")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("Where")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("From")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("Blue Note")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("$40 – $90")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText(/doors 7:00 PM/)).toBeTruthy();
    expect(screen.getAllByText("Jazz").length).toBeGreaterThan(0);
  });

  it("shows a day with no time when the date has none", async () => {
    detailBody = detail({ date: "2026-12-02", doorsTime: null, showTime: null });
    page({ seed: { ...seed, date: "2026-12-02" } });
    await screen.findByRole("heading", { name: "Jazz Night" });
    const when = Array.from(document.querySelectorAll("dt")).find((dt) => dt.textContent === "When")!.parentElement!;
    expect(when.textContent).toMatch(/Wed.*December 2/);
    expect(when.textContent).not.toMatch(/AM|PM/);
  });

  it("uses the card's image, then a fallback", async () => {
    detailBody = detail({ imageUrl: null });
    page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(hero.image).toBe("https://img/seed.jpg");
    cleanup();
    sessionStorage.clear();
    detailBody = detail({ imageUrl: null });
    page({ seed: { ...seed, imageUrl: undefined } });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(hero.image).toBe(hero.fallbackImage);
  });

  it("goes back to Discover from the page, but not from the panel", async () => {
    page();
    expect((await screen.findByRole("link", { name: "Back" })).getAttribute("href")).toBe(`/trips/${TRIP}/discover`);
    cleanup();
    page({ variant: "panel" });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    expect(hero.surface).toBe(true);
  });
});

describe("EventDetailView: tickets", () => {
  it("links to the seller, names it, and lists other ways in", async () => {
    page();
    const link = await screen.findByRole("link", { name: /Get tickets/ });
    expect(link.getAttribute("href")).toBe("https://www.ticketmaster.com/e/1");
    expect(screen.getByText("via Ticketmaster")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Also on SeatGeek/ })).toBeTruthy();
    expect(screen.getByText("$40 – $90", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Oct 1")).toBeTruthy();
  });

  it("does not repeat the main link among the other ways in", async () => {
    detailBody = detail({ ticketOptions: [{ label: "Same", url: "https://www.ticketmaster.com/e/1" }] });
    page();
    await screen.findByRole("link", { name: /Get tickets/ });
    expect(screen.queryByRole("link", { name: /Same/ })).toBeNull();
  });

  it("falls back to the card's link when the seller is one it knows, and shows no button for a link it cannot vouch for", async () => {
    detailBody = detail({ url: null, ticketOptions: [] });
    page();
    expect((await screen.findByRole("link", { name: /Get tickets/ })).getAttribute("href")).toBe(seed.url);
    cleanup();
    sessionStorage.clear();
    detailBody = detail({ url: null, ticketOptions: [] });
    page({ seed: { ...seed, url: "https://random.example/e", source: "other" } });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(screen.queryByRole("link", { name: /Get tickets/ })).toBeNull();
  });
});

describe("EventDetailView: adding it to the trip", () => {
  it("adds a timed stop on the right day, and says so", async () => {
    const user = u();
    page();
    await user.click((await screen.findAllByRole("button", { name: "Add to trip" }))[0]);
    expect(mutate).toHaveBeenCalledWith("/api/commands", { method: "POST", announce: ["itinerary"], body: { type: "add_itinerary_item", tripId: TRIP, title: "Jazz Night", dayIndex: 2, time: "20:00", latitude: 40.73, longitude: -74 } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Added to Day 2 at 8:00 PM.", "success"));
  });

  it("falls back to day one and leaves out what it does not know", async () => {
    detailBody = detail({ date: null, showTime: null, latitude: null, longitude: null });
    tripData = { trip: { start_date: null }, itinerary: [] };
    const user = u();
    page({ seed: { ...seed, date: undefined } });
    await user.click((await screen.findAllByRole("button", { name: "Add to trip" }))[0]);
    expect(mutate.mock.calls[0][1].body).toEqual({ type: "add_itinerary_item", tripId: TRIP, title: "Jazz Night", dayIndex: 1 });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Added to Day 1.", "success"));
  });

  it("says when it could not be added", async () => {
    mutate.mockResolvedValue({ ok: false });
    const user = u();
    page();
    await user.click((await screen.findAllByRole("button", { name: "Add to trip" }))[0]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't add Jazz Night to your trip. Try again.", "error"));
    expect(screen.getAllByRole("button", { name: "Add to trip" })[0].hasAttribute("disabled")).toBe(false);
  });

  it("shows where it already is, case-insensitively, and does not add it twice", async () => {
    tripData = { trip: { start_date: "2026-12-01" }, itinerary: [{ title: "  jazz night ", day_index: 3 }] };
    page();
    const button = (await screen.findAllByRole("button", { name: "On Day 3" }))[0];
    expect(button.hasAttribute("disabled")).toBe(true);
    cleanup();
    tripData = { trip: {}, itinerary: [{ title: "Jazz Night" }] };
    page();
    expect((await screen.findAllByRole("button", { name: "On your trip" })).length).toBeGreaterThan(0);
  });

  it("asks a guest to save the trip first", async () => {
    guest = true;
    const user = u();
    page();
    await user.click((await screen.findAllByRole("button", { name: "Add to trip" }))[0]);
    expect(openGate).toHaveBeenCalledWith("add events to your itinerary");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("links the page to a ready-written question, but not the panel", async () => {
    page();
    expect((await screen.findByRole("link", { name: "Ask Roam if it fits" })).getAttribute("href")).toContain(`/trips/${TRIP}/chat`);
    cleanup();
    page({ variant: "panel" });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(screen.queryByRole("link", { name: "Ask Roam if it fits" })).toBeNull();
  });
});

describe("EventDetailView: sections", () => {
  it("tidies the about text", async () => {
    page();
    const about = await screen.findByText(/A night of jazz/);
    expect(about.textContent).toBe("Heading\nReal title\nA night of jazz.\n\nMore.");
  });

  it("lists the line-up: the headliner, and support acts as pills", async () => {
    page();
    const section = (await screen.findByRole("heading", { name: "Line-up" })).closest("section")!;
    expect(within(section).getByText("Headliner")).toBeTruthy();
    expect(within(section).getByText(/headlining/)).toBeTruthy();
    expect(within(section).getByText("Support A")).toBeTruthy();
    expect(within(section).getByText("Support B")).toBeTruthy();
  });

  it("skips a line-up that only repeats the title, but shows a note about it", async () => {
    detailBody = detail({ performers: ["Jazz Night"], lineupNote: "Doors early." });
    page();
    expect(await screen.findByText("Doors early.")).toBeTruthy();
    expect(screen.queryByText(/headlining/)).toBeNull();
    cleanup();
    sessionStorage.clear();
    detailBody = detail({ performers: ["Jazz Night"], lineupNote: null });
    page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(screen.queryByRole("heading", { name: "Line-up" })).toBeNull();
  });

  it("shows a line-up note when the bill lists no acts at all", async () => {
    detailBody = detail({ performers: [], lineupNote: "Special guests to be announced." });
    page();
    expect(await screen.findByText("Special guests to be announced.")).toBeTruthy();
  });

  it("drops a line-up note that only repeats the acts already listed", async () => {
    detailBody = detail({ performers: ["Headliner", "Support A"], lineupNote: "Headliner with support a" });
    page();
    await screen.findByRole("heading", { name: "Line-up" });
    expect(screen.queryByText("Headliner with support a")).toBeNull();
  });

  it("shows the venue with a map link, using the coordinates, else the name", async () => {
    page();
    const venue = (await screen.findByRole("heading", { name: "Venue" })).closest("section")!;
    expect(within(venue).getByText("131 W 3rd St, New York, NY")).toBeTruthy();
    expect(within(venue).getByRole("link", { name: "Google Maps" }).getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=40.73,-74");
    cleanup();
    sessionStorage.clear();
    detailBody = detail({ latitude: null, longitude: null });
    page();
    const again = (await screen.findByRole("heading", { name: "Venue" })).closest("section")!;
    expect(within(again).getByRole("link", { name: "Google Maps" }).getAttribute("href")).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Blue Note 131 W 3rd St, New York, NY")}`);
  });

  it("lists what is good to know, and the note", async () => {
    page();
    const section = (await screen.findByRole("heading", { name: "Good to know" })).closest("section")!;
    const rows = Array.from(section.querySelectorAll("dt")).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(rows).toEqual([["Doors", "7:00 PM"], ["Show", "8:00 PM"], ["Admission", "Seated"], ["Age", "18+"], ["Promoter", "Live Nation"], ["Status", "onsale"]]);
    expect(within(section).getByText("No flash photography.")).toBeTruthy();
  });

  it("shows what to expect, and the sources behind the page", async () => {
    page();
    expect(await screen.findByText("Two sets.")).toBeTruthy();
    expect(screen.getByText("1 source")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Venue site/ }).getAttribute("href")).toBe("https://bluenote.example");
    cleanup();
    sessionStorage.clear();
    detailBody = detail({ sources: [{ title: "A", url: "https://a" }, { title: "B", url: "https://b" }] });
    page();
    expect(await screen.findByText("2 sources")).toBeTruthy();
  });

  it("leaves out sections the event has nothing for", async () => {
    detailBody = detail({ about: null, whatToExpect: null, performers: [], venueName: null, pleaseNote: null, doorsTime: null, showTime: null, admission: null, ageInfo: null, promoter: null, status: null, sources: [], priceRange: null, onSale: null, genre: null });
    page({ seed: { ...seed, venue: undefined } });
    await screen.findByRole("heading", { name: "Jazz Night" });
    for (const name of ["About", "What to expect", "Line-up", "Venue", "Good to know"]) expect(screen.queryByRole("heading", { name })).toBeNull();
    expect(screen.queryByText(/source/)).toBeNull();
  });

  it("looks for things near the venue", async () => {
    page();
    await screen.findByTestId("recs");
    expect(recs).toMatchObject({ tripId: TRIP, kind: "event", excludeId: "https://www.ticketmaster.com/e/1", anchorName: "Blue Note", cityHint: "New York, NY", genre: "Jazz", lat: 40.73, lng: -74 });
  });
});

describe("EventDetailView: on the phone", () => {
  beforeEach(() => { });

  it("docks the add and tickets buttons at the bottom of the page", async () => {
    page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    const docked = document.querySelector(".fixed")!;
    expect(within(docked as HTMLElement).getByRole("button", { name: "Add to trip" })).toBeTruthy();
    expect(within(docked as HTMLElement).getByRole("link", { name: /Tickets/ }).getAttribute("href")).toBe("https://www.ticketmaster.com/e/1");
  });

  it("shows the facts as a list, with the price's seller", async () => {
    page();
    await screen.findByRole("heading", { name: "Jazz Night" });
    const list = document.querySelector("ul.divide-y")!;
    expect(list.textContent).toContain("Blue Note");
    expect(list.textContent).toContain("$40 – $90");
    expect(list.textContent).toContain("Tickets via Ticketmaster");
  });

  it("has no dock inside the panel", async () => {
    page({ variant: "panel" });
    await screen.findByRole("heading", { name: "Jazz Night" });
    expect(document.querySelector(".fixed")).toBeNull();
  });
});
