// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BedDouble, Plane, Ticket, Train, Utensils, Home } from "lucide-react";

/**
 * Characterization tests for the Today screen: the saved offline copy, the day laid out for a wide screen (numbered stops, what is
 * booked, where you sleep) and the phone's version (map, "Next up", the rest of the day). Weather, motion and the offline store are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let live: Any | null;
let offline: { data: Any; savedAt: number } | null;
let narrow = false;
const readTrip = vi.fn(async () => offline);

vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => (live ? { data: live } : null) }));
vi.mock("@/lib/client/offline-store", () => ({ readTrip: (...a: unknown[]) => (readTrip as any)(...a) }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => narrow }));
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }: Any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/TripWeather", () => ({ TripWeather: ({ location }: Any) => <div data-testid="weather">{location}</div> }));
vi.mock("@/components/EmptyState", () => ({ EmptyState: ({ children, action }: Any) => <div data-testid="empty">{children}{action}</div> }));
vi.mock("@/components/motion-primitives", () => ({
  Reveal: ({ children }: Any) => <div>{children}</div>,
  Stagger: ({ children, className }: Any) => <div className={className}>{children}</div>,
  StaggerItem: ({ children }: Any) => <div>{children}</div>,
}));
vi.mock("@/components/overview/ReservationSheet", () => ({
  KIND_META: { stay: { icon: BedDouble }, flight: { icon: Plane }, train: { icon: Train }, activity: { icon: Ticket }, dining: { icon: Utensils }, other: { icon: Home } },
}));

import { TodayView } from "../../features/itinerary/ui/TodayView";

const stop = (id: string, title: string, day: number, position: number, meta: Any | null = null) => ({ id, title, day_index: day, position, metadata: meta });
const res = (over: Any = {}) => ({ id: "r1", kind: "flight", title: "TP 123", startsOn: "2026-10-20", endsOn: null, startTime: "09:15", endTime: null, place: null, toPlace: null, status: "confirmed", attachments: [], ...over });
const stayDecision = (over: Any = {}) => ({ kind: "stay", value: { provider: "liteapi", hotelId: "h", hotelName: "Hotel Avenida", roomName: "Deluxe", board: null, refundable: true, checkin: "2026-10-20", checkout: "2026-10-24", nights: 4, nightlyAmount: 100, totalAmount: 400, currency: "EUR", latitude: null, longitude: null, address: null, thumbnail: null, ...over } });
const data = (over: Any = {}) => ({
  trip: { id: TRIP, name: "Lisbon long weekend", destination: "Lisbon", start_date: "2026-10-20", end_date: "2026-10-24", stops: null },
  itinerary: [], decisions: [], reservations: [], ...over,
});
const at = (hh: number, mm = 0) => vi.setSystemTime(new Date(2026, 9, 20, hh, mm));
const view = () => render(<TodayView tripId={TRIP} />);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(14, 0);
  live = data(); offline = null; narrow = false;
  readTrip.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("TodayView: without a connection", () => {
  it("says so when nothing was saved", async () => {
    live = null;
    view();
    expect(await screen.findByText(/Nothing saved for offline yet/)).toBeTruthy();
    expect(readTrip).toHaveBeenCalledWith(TRIP);
  });

  it("does not look for a saved copy while the live trip is there", () => {
    view();
    expect(readTrip).not.toHaveBeenCalled();
  });

  it("shows the last saved copy with a note of when it was saved", async () => {
    live = null;
    offline = { data: data({ itinerary: [stop("a", "Alfama walk", 1, 1)] }), savedAt: Date.UTC(2026, 9, 18, 10, 0) };
    view();
    expect(await screen.findByText("Alfama walk")).toBeTruthy();
    expect(screen.getByText(/Offline — showing your last saved copy \(/)).toBeTruthy();
  });

  it("words the note shorter on the phone", async () => {
    narrow = true;
    live = null;
    offline = { data: data(), savedAt: 1 };
    view();
    expect(await screen.findByText("Showing your last saved copy")).toBeTruthy();
  });
});

describe("TodayView: the day, wide", () => {
  it("names the day and the trip, the date, the city and its weather", () => {
    view();
    expect(screen.getByText("Day 1 · Lisbon long weekend")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Tuesday, October 20/);
    expect(screen.getByText("Today in Lisbon")).toBeTruthy();
    expect(screen.getByTestId("weather").textContent).toBe("Lisbon");
  });

  it("numbers today's stops in order, leaving out other days", () => {
    live = data({ itinerary: [stop("c", "Dinner", 1, 3), stop("a", "Alfama walk", 1, 1), stop("x", "Sintra", 2, 1), stop("b", "Tram 28", 1, 2)] });
    view();
    const items = screen.getAllByText(/^(Alfama walk|Tram 28|Dinner)$/);
    expect(items.map((e) => e.textContent)).toEqual(["Alfama walk", "Tram 28", "Dinner"]);
    expect(screen.queryByText("Sintra")).toBeNull();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText(/^Day 2$/)).toBeNull();
  });

  it("lays out the whole itinerary, with its days, before the trip starts", () => {
    live = data({ trip: { ...data().trip, start_date: "2026-11-02", end_date: "2026-11-06" }, itinerary: [stop("b", "Sintra", 2, 1), stop("a", "Alfama walk", 1, 2), stop("c", "Tram 28", 1, 1)] });
    view();
    expect(screen.getByText("Your itinerary")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Lisbon long weekend");
    expect(screen.getAllByText(/^(Sintra|Alfama walk|Tram 28)$/).map((e) => e.textContent)).toEqual(["Tram 28", "Alfama walk", "Sintra"]);
    expect(screen.getAllByText(/^Day [12]$/).map((e) => e.textContent)).toEqual(["Day 1", "Day 1", "Day 2"]);
    expect(screen.queryByText(/Today in/)).toBeNull();
  });

  it("does the same for a trip with no dates", () => {
    live = data({ trip: { ...data().trip, start_date: null, end_date: null }, itinerary: [stop("a", "Alfama walk", 1, 1)] });
    view();
    expect(screen.getByText("Your itinerary")).toBeTruthy();
    expect(screen.queryByTestId("weather")).toBeNull();
  });

  it("shortens a long multi-stop trip name to its two ends", () => {
    live = data({ trip: { ...data().trip, name: "Paris → Rome → Athens", start_date: null, end_date: null } });
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Paris → Athens");
  });

  it("invites ideas when today is empty, and says so differently with no dates", () => {
    view();
    expect(screen.getByTestId("empty").textContent).toContain("Nothing is planned for today yet");
    expect(screen.getByRole("link", { name: "Ask Roam for ideas" }).getAttribute("href")).toBe(`/trips/${TRIP}/chat`);
    expect(screen.getByRole("link", { name: /Discover places/ }).getAttribute("href")).toBe(`/trips/${TRIP}/discover`);
    cleanup();
    live = data({ trip: { ...data().trip, start_date: null } });
    view();
    expect(screen.getByTestId("empty").textContent).toContain("No itinerary items yet.");
  });

  it("lists what is booked today, with times, routes and tickets", () => {
    live = data({
      reservations: [
        res({ id: "late", kind: "dining", title: "Dinner at Ramiro", startTime: "20:00", place: "Ramiro" }),
        res({ id: "early", kind: "flight", title: "TP 123", startTime: "09:15", place: "LIS", toPlace: "OPO", attachments: [{ path: "a b/ticket.pdf" }] }),
      ],
    });
    view();
    const list = screen.getByRole("list", { name: "Booked today" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.querySelector("p")?.textContent)).toEqual(["TP 123", "Dinner at Ramiro"]);
    expect(rows[0].textContent).toContain("LIS → OPO");
    expect(rows[0].textContent).toMatch(/9:15/);
    expect(within(rows[0]).getByRole("link", { name: "Ticket" }).getAttribute("href")).toBe(`/api/trips/${TRIP}/reservations/early/files?path=${encodeURIComponent("a b/ticket.pdf")}`);
    expect(within(rows[1]).queryByRole("link", { name: "Ticket" })).toBeNull();
    expect(rows[1].textContent).toContain("Ramiro");
  });

  it("shows arrivals and check-outs at their end time, on their own day", () => {
    vi.setSystemTime(new Date(2026, 9, 21, 14, 0)); // trip day 2
    live = data({ reservations: [
      res({ id: "f", kind: "train", title: "Night train", startsOn: "2026-10-20", endsOn: "2026-10-21", startTime: "22:00", endTime: "06:40", place: "A", toPlace: "B" }),
      res({ id: "s", kind: "stay", title: "Pensão", startsOn: "2026-10-20", endsOn: "2026-10-21", startTime: "15:00", endTime: "11:00" }),
    ] });
    view();
    const rows = within(screen.getByRole("list", { name: "Booked today" })).getAllByRole("listitem");
    const train = rows.find((r) => r.textContent?.includes("Night train"))!;
    expect(train.textContent).toContain("Arrives");
    expect(train.textContent).toMatch(/6:40/);
    expect(train.textContent).not.toContain("A → B"); // the route is only said when it leaves
    const stay = rows.find((r) => r.textContent?.includes("Pensão"))!;
    expect(stay.textContent).toContain("Check-out");
    expect(stay.textContent).toMatch(/11:00/);
  });

  it("names the departure on the day it leaves", () => {
    live = data({ reservations: [res({ id: "f", kind: "train", title: "Night train", startsOn: "2026-10-20", endsOn: "2026-10-21", startTime: "22:00", endTime: "06:40", place: "A", toPlace: "B" })] });
    view();
    const row = within(screen.getByRole("list", { name: "Booked today" })).getByRole("listitem");
    expect(row.textContent).toContain("Departs");
    expect(row.textContent).toMatch(/10:00/);
    expect(row.textContent).toContain("A → B");
  });

  it("says where you are sleeping: the stay you locked, else a booking that covers tonight", () => {
    live = data({ decisions: [stayDecision()], reservations: [res({ id: "s", kind: "stay", title: "Pensão", startsOn: "2026-10-18", endsOn: "2026-10-22", place: "Rua X" })] });
    view();
    expect(screen.getByText("Hotel Avenida")).toBeTruthy();
    expect(screen.getByText("Deluxe")).toBeTruthy();
    expect(screen.queryByText("Rua X")).toBeNull();
    cleanup();
    live = data({ reservations: [res({ id: "s", kind: "stay", title: "Pensão", startsOn: "2026-10-18", endsOn: "2026-10-22", place: "Rua X" })] });
    view();
    expect(screen.getAllByText("Pensão").length).toBeGreaterThan(0);
    expect(screen.getByText("Rua X")).toBeTruthy();
    expect(screen.getByText(/Where you.re sleeping/)).toBeTruthy();
  });

  it("ignores a cancelled booking, one that ends today, and one that has not begun", () => {
    live = data({ reservations: [
      res({ id: "1", kind: "stay", title: "Cancelled", startsOn: "2026-10-18", endsOn: "2026-10-22", status: "cancelled" }),
      res({ id: "2", kind: "stay", title: "Checked out", startsOn: "2026-10-17", endsOn: "2026-10-20" }),
      res({ id: "3", kind: "stay", title: "Not yet", startsOn: "2026-10-21", endsOn: "2026-10-23" }),
    ] });
    view();
    expect(screen.queryByText(/Where you.re sleeping/)).toBeNull();
    expect(screen.queryByText("Cancelled")).toBeNull();
  });
});

describe("TodayView: on the phone", () => {
  beforeEach(() => { narrow = true; });
  const withStops = (extra: Any = {}) => data({
    itinerary: [
      stop("a", "Breakfast at Pastéis", 1, 1, { time: "09:00" }),
      stop("b", "Tram 28", 1, 2, { time: "15:00", latitude: 38.71, longitude: -9.13 }),
      stop("c", "Dinner at Ramiro", 1, 3, { time: "20:30" }),
      stop("d", "Sintra", 2, 1, { time: "10:00" }),
    ],
    ...extra,
  });

  it("opens with Today, the date and the city's weather", async () => {
    live = withStops();
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Today");
    expect(screen.getByText(/Tuesday, October 20/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("weather").textContent).toBe("Lisbon"));
  });

  it("puts the next stop first, skipping what is long past, and the rest under 'Later today'", async () => {
    live = withStops();
    view();
    const next = await screen.findByRole("region", { name: "Next up" });
    expect(within(next).getByRole("heading").textContent).toBe("Tram 28");
    const later = screen.getByRole("region", { name: "Later today" });
    expect(within(later).getByText("Dinner at Ramiro")).toBeTruthy();
    expect(screen.queryByText("Breakfast at Pastéis")).toBeNull();
    expect(screen.queryByText("Sintra")).toBeNull();
  });

  it("keeps a stop that began within the last half hour as the next one", async () => {
    at(9, 20);
    live = withStops();
    view();
    expect(within(await screen.findByRole("region", { name: "Next up" })).getByRole("heading").textContent).toBe("Breakfast at Pastéis");
    cleanup();
    at(9, 45);
    view();
    expect(within(await screen.findByRole("region", { name: "Next up" })).getByRole("heading").textContent).toBe("Tram 28");
  });

  it("counts down to it", async () => {
    live = withStops();
    view();
    expect(await screen.findByText("In 1h")).toBeTruthy();
    for (const [h, m, label] of [[14, 30, "In 30 min"], [12, 55, "In 2h 5m"], [15, 0, "Now"], [15, 10, "Now"]] as const) {
      cleanup(); at(h, m); view();
      expect(await screen.findByText(label)).toBeTruthy();
    }
  });

  it("sorts a stop with no time last, and keeps it once the timed ones have passed", async () => {
    live = data({ itinerary: [stop("a", "Wander Chiado", 1, 1), stop("b", "Dinner", 1, 2, { time: "20:00" })] });
    view();
    expect(within(await screen.findByRole("region", { name: "Next up" })).getByRole("heading").textContent).toBe("Dinner");
    expect(within(screen.getByRole("region", { name: "Later today" })).getByText("Wander Chiado")).toBeTruthy();
    cleanup();
    at(22, 0);
    view();
    const next = await screen.findByRole("region", { name: "Next up" });
    expect(within(next).getByRole("heading").textContent).toBe("Wander Chiado");
    expect(within(next).queryByText(/^In |^Now$/)).toBeNull();
  });

  it("gives directions to the next stop when it has a place, else a way to see it on the map", async () => {
    live = withStops();
    view();
    expect((await screen.findByRole("link", { name: /Directions/ })).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=38.71,-9.13");
    cleanup();
    live = data({ itinerary: [stop("a", "Wander Chiado", 1, 1, { time: "18:00" })] });
    view();
    expect((await screen.findByRole("link", { name: /See it on the map/ })).getAttribute("href")).toBe(`/trips/${TRIP}/map?day=1`);
  });

  it("says when tickets are already booked for it, ignoring case", async () => {
    live = withStops({ reservations: [res({ id: "t", kind: "activity", title: "tram 28", startTime: "15:00" })] });
    view();
    expect(await screen.findByText("Tickets booked")).toBeTruthy();
  });

  it("shows the day on a map, only for stops that have a place", async () => {
    live = data({ itinerary: [
      stop("a", "A", 1, 1, { time: "15:00", latitude: 38.7, longitude: -9.1 }),
      stop("b", "B", 1, 2, { time: "16:00", latitude: 0, longitude: 0 }),
      stop("c", "C", 1, 3, { time: "17:00" }),
      stop("d", "D", 1, 4, { time: "18:00", latitude: 38.8, longitude: -9.2 }),
    ] });
    view();
    const link = await screen.findByRole("link", { name: "Open the day on the map" });
    expect(link.getAttribute("href")).toBe(`/trips/${TRIP}/map?day=1`);
    const src = link.querySelector("img")!.getAttribute("src")!;
    expect(decodeURIComponent(src)).toContain("markers=-9.1,38.7|-9.2,38.8&w=720&h=315");
  });

  it("drops the map when its picture cannot load, and has none without places", async () => {
    live = data({ itinerary: [stop("a", "A", 1, 1, { time: "15:00", latitude: 38.7, longitude: -9.1 })] });
    view();
    const img = (await screen.findByRole("link", { name: "Open the day on the map" })).querySelector("img")!;
    fireEvent.error(img);
    expect(screen.queryByRole("link", { name: "Open the day on the map" })).toBeNull();
    cleanup();
    live = data({ itinerary: [stop("a", "A", 1, 1, { time: "15:00" })] });
    view();
    expect(screen.queryByRole("link", { name: "Open the day on the map" })).toBeNull();
  });

  it("says everything is done once the day's stops have passed", async () => {
    at(21, 30);
    live = withStops();
    view();
    expect((await screen.findByTestId("empty")).textContent).toContain("That is everything planned for today.");
    expect(screen.queryByRole("region", { name: "Next up" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ask Roam for ideas" })).toBeTruthy();
  });

  it("says a free day is a free day", async () => {
    view();
    expect((await screen.findByTestId("empty")).textContent).toContain("Nothing is planned for this day yet");
  });

  it("previews the first planned day before the trip starts", async () => {
    live = data({ trip: { ...data().trip, start_date: "2026-11-02", end_date: "2026-11-06" }, itinerary: [stop("a", "Sintra", 2, 1, { time: "10:00" }), stop("b", "Cascais", 2, 2, { time: "14:00" })] });
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Day 2");
    expect(screen.getByText("Trip starts November 2")).toBeTruthy();
    const next = await screen.findByRole("region", { name: "Next up" });
    expect(within(next).getByText("First up")).toBeTruthy();
    expect(within(next).getByRole("heading").textContent).toBe("Sintra");
    expect(within(next).queryByText(/^In /)).toBeNull();
    expect(screen.getByRole("region", { name: "Later today" }).querySelector("h2")?.textContent).toBe("Then");
  });

  it("falls back to Day 1 with no stops and no dates", async () => {
    live = data({ trip: { ...data().trip, start_date: null, end_date: null } });
    view();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Day 1");
    expect(screen.getByText("Your trip")).toBeTruthy();
  });

  it("lists what is booked, then where you sleep tonight", async () => {
    live = withStops({ decisions: [stayDecision()], reservations: [res({ id: "f", title: "TP 123", attachments: [{ path: "t.pdf" }] })] });
    view();
    const booked = await screen.findByRole("list", { name: "Booked today" });
    expect(within(booked).getByRole("link", { name: "Ticket" })).toBeTruthy();
    expect(screen.getByText("Tonight you sleep at")).toBeTruthy();
    expect(screen.getByText("Hotel Avenida")).toBeTruthy();
  });

  it("says 'Where you’ll sleep' before the trip, using a booked stay", async () => {
    live = data({ trip: { ...data().trip, start_date: "2026-11-02", end_date: "2026-11-06" }, reservations: [res({ id: "s", kind: "stay", title: "Pensão", startsOn: "2026-11-02", endsOn: "2026-11-06" })] });
    view();
    // before the trip starts there is no "today", so no stay is shown
    expect(screen.queryByText("Where you’ll sleep")).toBeNull();
  });

  it("sends a next stop at (0, 0) to the map, not to a pin in the ocean", async () => {
    live = data({ itinerary: [stop("a", "Ghost", 1, 1, { time: "18:00", latitude: 0, longitude: 0 })] });
    view();
    expect(await screen.findByRole("link", { name: /See it on the map/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Directions/ })).toBeNull();
  });

  it("shows an arrival at its end time on the phone too", async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 14, 0));
    live = data({ reservations: [res({ id: "f", kind: "train", title: "Night train", startsOn: "2026-10-20", endsOn: "2026-10-21", startTime: "22:00", endTime: "06:40" })] });
    view();
    const row = within(await screen.findByRole("list", { name: "Booked today" })).getByRole("listitem");
    expect(row.textContent).toContain("Arrives");
    expect(row.textContent).toMatch(/6:40/);
  });

  it("calls the locked stay 'Where you’ll sleep' before the trip begins", async () => {
    live = data({ trip: { ...data().trip, start_date: "2026-11-02", end_date: "2026-11-06" }, decisions: [stayDecision()] });
    view();
    expect(await screen.findByText("Where you’ll sleep")).toBeTruthy();
    expect(screen.queryByText("Tonight you sleep at")).toBeNull();
  });

  it("uses the wide layout when the screen is wide, phone design or not", () => {
    narrow = false;
    live = withStops();
    view();
    expect(screen.queryByRole("region", { name: "Next up" })).toBeNull();
    expect(screen.getByText("Day 1 · Lisbon long weekend")).toBeTruthy();
  });
});
