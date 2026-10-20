// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeWorkspaceChanges } from "../../lib/application/workspace-events";
import { TRIP, booking, createApi, matchMedia, stop, stubBrowser } from "../support/itinerary-harness";

/** Characterization tests for the itinerary on a phone (the redesign: one day at a time, a week strip, a sheet of actions per stop). */
const toast = vi.fn();
const openPanel = vi.fn();
vi.mock("@/lib/phone-v2", () => ({ PHONE_V2: true }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanel: () => ({ openPanel }) }));
vi.mock("@/components/DestinationCombobox", async () => ({ DestinationCombobox: (await import("../support/itinerary-harness")).mockChildren.DestinationCombobox }));
vi.mock("@/components/DateTimeField", async () => ({ TimeField: (await import("../support/itinerary-harness")).mockChildren.TimeField }));
vi.mock("@/components/overview/ReservationSheet", async () => ({ KIND_META: (await import("../support/itinerary-harness")).mockChildren.kindMeta }));
vi.mock("@/components/HotelPhoto", () => ({ HotelPhoto: () => <div>PHOTO</div> }));
vi.mock("@/components/TripWeather", () => ({ TripRouteWeather: () => <div>WEATHER</div> }));
vi.mock("@/components/overview/BookingNotices", () => ({ BookingNotices: () => null }));

import { ItinerarySurface } from "../../features/itinerary/ui/ItinerarySurface";

let api: ReturnType<typeof createApi>;
let state: { items: ReturnType<typeof stop>[]; reservations: ReturnType<typeof booking>[] };
let changes: string[];
let unsubscribe: () => void;
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

const show = (props: Partial<React.ComponentProps<typeof ItinerarySurface>> = {}) =>
  render(<ItinerarySurface tripId={TRIP} initialItems={state.items as never} startDate="2026-10-10" plannedDays={3} {...props} />);
const patches = () => api.ofMethod("PATCH");
const stopNames = () => screen.getAllByRole("button", { name: /^Options for / }).map((b) => b.getAttribute("aria-label")!.replace("Options for ", ""));

beforeEach(() => {
  toast.mockClear();
  openPanel.mockClear();
  state = {
    items: [stop("Louvre", 1, 0), stop("Lunch", 1, 1, { time: "12:30" }), stop("Breakfast", 1, 2, { time: "08:00" }), stop("Orsay", 2, 0)],
    reservations: [],
  };
  api = createApi(state);
  stubBrowser();
  window.matchMedia = matchMedia(true);
  changes = [];
  unsubscribe = subscribeWorkspaceChanges((c) => changes.push(...c));
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.unstubAllGlobals();
});

describe("ItinerarySurface on a phone", () => {
  it("shows one day at a time, with where you are in the trip and a stop count", () => {
    show();
    expect(screen.getByText("Day 1 of 3")).toBeTruthy();
    expect(screen.getByText("3 stops")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Today view/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /View on map/ }).getAttribute("href")).toBe(`/trips/${TRIP}/map?day=1`);
  });

  it("lists the day's stops by the clock: timed ones first, then the rest in plan order", () => {
    show();
    expect(stopNames()).toEqual(["Breakfast", "Lunch", "Louvre"]);
  });

  it("jumps to a day from the week strip, marking days that have plans", async () => {
    show();
    const strip = screen.getByRole("group", { name: "Days" });
    expect(within(strip).getAllByRole("button")).toHaveLength(3);
    expect(within(strip).getByRole("button", { name: /^Day 1.*has plans/ })).toBeTruthy();
    expect(within(strip).getByRole("button", { name: /^Day 3(?!.*has plans)/ })).toBeTruthy();
    await u().click(within(strip).getByRole("button", { name: /^Day 2/ }));
    expect(screen.getByText("Day 2 of 3")).toBeTruthy();
    expect(stopNames()).toEqual(["Orsay"]);
  });

  it("jumps to a day from the 'Choose a day' sheet", async () => {
    show();
    const user = u();
    await user.click(screen.getByRole("button", { name: "Choose a day" }));
    const sheet = await screen.findByText("Go to a day");
    await user.click(within(sheet.closest("div")!.parentElement!).getByText("02"));
    await waitFor(() => expect(screen.getByText("Day 2 of 3")).toBeTruthy());
  });

  it("offers 'Plan this day' on an empty day and 'Add a stop' on a planned one", async () => {
    show();
    expect(screen.getByRole("button", { name: /Add a stop/ })).toBeTruthy();
    await u().click(within(screen.getByRole("group", { name: "Days" })).getByRole("button", { name: /^Day 3/ }));
    expect(screen.getByRole("button", { name: /Plan this day/ })).toBeTruthy();
    expect(screen.getByText("Open day")).toBeTruthy();
  });

  it("adds a stop to the day being shown", async () => {
    api.handlers.push((c) => (c.method === "POST" ? { json: { item: stop("Catacombs", 2, 1) } } : undefined));
    const user = u();
    show();
    await user.click(within(screen.getByRole("group", { name: "Days" })).getByRole("button", { name: /^Day 2/ }));
    await user.click(screen.getByRole("button", { name: /Add a stop/ }));
    // A change event, not keystrokes: the sheet takes focus a beat after it opens, which would cut a fast synthetic typing run short.
    fireEvent.change(await screen.findByLabelText("Add itinerary item"), { target: { value: "Catacombs" } });
    await user.click(screen.getByRole("button", { name: "Add to the plan" }));
    await waitFor(() => expect(api.ofMethod("POST")).toHaveLength(1));
    expect(api.ofMethod("POST")[0].body).toEqual({ title: "Catacombs", dayIndex: 2, providerId: undefined });
    await screen.findByRole("button", { name: "Options for Catacombs" });
  });

  it("opens a stop's place when tapped", async () => {
    state.items = [stop("Louvre", 1, 0, { provider_id: "prov-1" })];
    show({ initialItems: state.items as never });
    await u().click(screen.getByText("Louvre"));
    expect(openPanel).toHaveBeenCalledWith({ kind: "place", placeId: "prov-1", name: "Louvre" });
  });

  it("shows bookings and clashes for the day", async () => {
    state.items = [stop("Museum", 1, 0, { time: "10:30" })];
    state.reservations = [booking()];
    show({ initialItems: state.items as never });
    expect(await screen.findByLabelText("Booked on day 1")).toBeTruthy();
    expect(screen.getAllByText("Food tour").length).toBeGreaterThan(0);
    expect(screen.getByText(/are close together/)).toBeTruthy();
  });

  it("marks a stop as Booked when a reservation has the same name", async () => {
    state.items = [stop("Food tour", 1, 0)];
    state.reservations = [booking()];
    show({ initialItems: state.items as never });
    await waitFor(() => expect(screen.getAllByText("Booked").length).toBeGreaterThan(0));
  });
});

describe("ItinerarySurface on a phone: a stop's options", () => {
  const openOptions = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
    await user.click(screen.getByRole("button", { name: `Options for ${title}` }));
    return screen.findByText("Time");
  };

  it("swaps an untimed stop with its neighbour in plan order (the first stop cannot go earlier)", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    expect((screen.getByRole("button", { name: /Earlier in the day/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Later in the day/ }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: /Later in the day/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body!.order).toEqual([{ title: "Lunch", dayIndex: 1, position: 0 }, { title: "Louvre", dayIndex: 1, position: 1 }, { title: "Breakfast", dayIndex: 1, position: 2 }]);
  });

  it("offers no earlier/later for a stop that has a time (the clock orders it)", async () => {
    const user = u();
    show();
    await openOptions(user, "Lunch");
    expect((screen.getByRole("button", { name: /Earlier in the day/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Later in the day/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sets a target time from the sheet", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    fireEvent.change(screen.getByLabelText("Target time for Louvre"), { target: { value: "09:15" } });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ title: "Louvre", time: "09:15" });
  });

  it("locks a stop, and the sheet then offers Unlock and disables moving and removing", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    await user.click(screen.getByRole("button", { name: /Lock this stop/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ title: "Louvre", locked: true });
    await openOptions(user, "Louvre");
    expect(screen.getByRole("button", { name: /Unlock/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Remove/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Move to the day after/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves a stop to the day after and follows it there", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    await user.click(screen.getByRole("button", { name: /Move to the day after/ }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body!.order).toContainEqual(expect.objectContaining({ title: "Louvre", dayIndex: 2 }));
    await waitFor(() => expect(screen.getByText("Day 2 of 3")).toBeTruthy());
    expect(stopNames()).toContain("Louvre");
  });

  it("cannot move a day-1 stop to the day before", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    expect((screen.getByRole("button", { name: /Move to the day before/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes a stop and offers Undo", async () => {
    const user = u();
    show();
    await openOptions(user, "Louvre");
    await user.click(screen.getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(api.ofMethod("DELETE")).toHaveLength(1));
    expect(api.ofMethod("DELETE")[0].body).toEqual({ title: "Louvre" });
    const status = await screen.findByText(/Louvre removed\./);
    await user.click(within(status.closest("p")!).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(patches().some((p) => p.body?.restore)).toBe(true));
    await act(async () => undefined);
    expect(changes).toContain("itinerary");
  });
});
