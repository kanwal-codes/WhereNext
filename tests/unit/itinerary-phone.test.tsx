// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRIP, booking, createApi, matchMedia, stop, stubBrowser } from "../support/itinerary-harness";

/**
 * Characterization tests for the itinerary on a phone: one day at a time with a week strip, a timeline per day, and bottom sheets for
 * choosing a day, a stop's options and adding a stop. The network and the sheets' animation are faked.
 */
const toast = vi.fn();
const openPanel = vi.fn();
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanel: () => ({ openPanel }) }));
vi.mock("@/components/motion-primitives", () => ({ Sheet: ({ open, children, ariaLabel }: { open: boolean; children: React.ReactNode; ariaLabel?: string }) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null) }));
vi.mock("@/components/DestinationCombobox", async () => ({ DestinationCombobox: (await import("../support/itinerary-harness")).mockChildren.DestinationCombobox }));
vi.mock("@/components/DateTimeField", async () => ({ TimeField: (await import("../support/itinerary-harness")).mockChildren.TimeField }));
vi.mock("@/components/overview/ReservationSheet", async () => ({ KIND_META: (await import("../support/itinerary-harness")).mockChildren.kindMeta }));
vi.mock("@/components/HotelPhoto", () => ({ HotelPhoto: () => <div>PHOTO</div> }));
vi.mock("@/components/TripWeather", () => ({ TripRouteWeather: () => <div>WEATHER</div> }));
vi.mock("@/components/overview/BookingNotices", () => ({ BookingNotices: () => <div>NOTICES</div> }));

import { ItinerarySurface } from "../../features/itinerary/ui/ItinerarySurface";

let api: ReturnType<typeof createApi>;
let state: { items: ReturnType<typeof stop>[]; reservations: ReturnType<typeof booking>[]; places?: unknown[] };
const show = (props: Partial<React.ComponentProps<typeof ItinerarySurface>> = {}) =>
  render(<ItinerarySurface tripId={TRIP} initialItems={state.items as never} plannedDays={3} startDate="2026-10-10" {...props} />);
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const patches = () => api.ofMethod("PATCH");

beforeEach(() => {
  toast.mockClear(); openPanel.mockClear();
  state = { items: [stop("Louvre", 1, 0), stop("Lunch", 1, 1), stop("Seine walk", 1, 2), stop("Orsay", 2, 0)], reservations: [] };
  api = createApi(state);
  stubBrowser();
  window.matchMedia = matchMedia(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ItinerarySurface on a phone: the day", () => {
  it("shows one day with its place in the trip, its date and how many stops", () => {
    show();
    expect(screen.getByText("Day 1 of 3")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Oct 10/);
    expect(screen.getByText("3 stops")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Louvre/ })).toBeTruthy();
    expect(screen.queryByText("Orsay")).toBeNull();
    expect(screen.getByRole("link", { name: /Today view/ }).getAttribute("href")).toBe(`/trips/${TRIP}/today`);
    expect(screen.getByRole("link", { name: /View on map/ }).getAttribute("href")).toBe(`/trips/${TRIP}/map?day=1`);
  });

  it("shows a strip of days that marks the ones with plans and moves between them", async () => {
    const user = u();
    show();
    const strip = screen.getByRole("group", { name: "Days" });
    const buttons = within(strip).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-current")).toBe("date");
    expect(buttons[0].getAttribute("aria-label")).toMatch(/^Day 1, .*, has plans$/);
    expect(buttons[2].getAttribute("aria-label")).toMatch(/^Day 3, /);
    expect(buttons[2].getAttribute("aria-label")).not.toMatch(/has plans/);
    await user.click(buttons[1]);
    expect(screen.getByText("Day 2 of 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Orsay/ })).toBeTruthy();
    expect(screen.getByText("1 stop")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View on map/ }).getAttribute("href")).toBe(`/trips/${TRIP}/map?day=2`);
  });

  it("says an empty day is open", async () => {
    const user = u();
    show();
    await user.click(within(screen.getByRole("group", { name: "Days" })).getAllByRole("button")[2]);
    expect(screen.getByText("Open day")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Plan this day/ })).toBeTruthy();
  });

  it("says a day with only bookings is booked, not open", async () => {
    const user = u();
    state.reservations = [booking({ title: "Food tour", startsOn: "2026-10-12" })];
    show();
    await user.click(within(screen.getByRole("group", { name: "Days" })).getAllByRole("button")[2]);
    await waitFor(() => expect(screen.getByText("Booked only")).toBeTruthy());
  });

  it("lets you pick a day from a list", async () => {
    const user = u();
    show();
    await user.click(screen.getByRole("button", { name: "Choose a day" }));
    const dialog = screen.getByRole("dialog", { name: "Choose a day" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(3);
    expect(within(dialog).getByText("3 stops")).toBeTruthy();
    expect(within(dialog).getByText("Open day")).toBeTruthy();
    await user.click(within(dialog).getAllByRole("button")[1]);
    expect(screen.getByText("Day 2 of 3")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts what has a time first, in time order, then the rest as they were added", () => {
    state.items = [stop("No time", 1, 0), stop("Late", 1, 1, { time: "18:00" }), stop("Early", 1, 2, { time: "09:00" })];
    show({ initialItems: state.items as never });
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names.findIndex((t) => t.includes("Early"))).toBeLessThan(names.findIndex((t) => t.includes("Late")));
    expect(names.findIndex((t) => t.includes("Late"))).toBeLessThan(names.findIndex((t) => t.includes("No time")));
  });

  it("shows a stop's time and whether it is locked or booked", () => {
    state.items = [stop("Louvre", 1, 0, { time: "10:00", locked: true }), stop("Food tour", 1, 1)];
    state.reservations = [booking({ title: "Food tour", startsOn: "2026-10-10" })];
    show({ initialItems: state.items as never });
    expect(screen.getByText(/10:00/)).toBeTruthy();
    return waitFor(() => expect(screen.getByText("Booked")).toBeTruthy()).then(() => expect(screen.getByText("Locked")).toBeTruthy());
  });

  it("lists the day's bookings and warns about stops close together", async () => {
    state.items = [stop("Louvre", 1, 0, { time: "10:00" }), stop("Museum", 1, 1, { time: "10:30" })];
    state.reservations = [booking({ title: "Food tour", startsOn: "2026-10-10" })];
    show({ initialItems: state.items as never });
    expect(await screen.findByRole("list", { name: "Booked on day 1" })).toBeTruthy();
    expect(screen.getAllByText(/are close together/).length).toBeGreaterThan(0);
  });

  it("opens the place when a stop is tapped", async () => {
    const user = u();
    state.items = [stop("Louvre", 1, 0, { provider_id: "g-louvre" })];
    show({ initialItems: state.items as never });
    await user.click(screen.getByRole("button", { name: /^Louvre/ }));
    expect(openPanel).toHaveBeenCalledWith(expect.objectContaining({ kind: "place", placeId: "g-louvre", name: "Louvre" }));
  });
});

describe("ItinerarySurface on a phone: a stop's options", () => {
  const openOptions = async (user: ReturnType<typeof u>, name: string) => { await user.click(screen.getByRole("button", { name: `Options for ${name}` })); return screen.getByRole("dialog", { name: `Options for ${name}` }); };

  it("moves a stop within the day or to another day, and follows it", async () => {
    const user = u();
    show();
    const dialog = await openOptions(user, "Louvre");
    expect(within(dialog).getByRole("button", { name: /Earlier in the day/ }).hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByRole("button", { name: /Move to the day before/ }).hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: /Move to the day after/ }));
    await waitFor(() => expect(patches().length).toBeGreaterThan(0));
    expect(screen.getByText("Day 2 of 3")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves a stop later in the day", async () => {
    const user = u();
    show();
    const dialog = await openOptions(user, "Louvre");
    await user.click(within(dialog).getByRole("button", { name: /Later in the day/ }));
    await waitFor(() => expect(patches().length).toBeGreaterThan(0));
    const order = screen.getAllByRole("button", { name: /^(Louvre|Lunch|Seine walk)/ }).map((b) => b.textContent);
    expect(order[0]).toContain("Lunch");
  });

  it("sets a time, which stops it being moved within the day", async () => {
    const user = u();
    show();
    const dialog = await openOptions(user, "Louvre");
    fireEvent.change(within(dialog).getByLabelText("Target time for Louvre"), { target: { value: "09:30" } });
    await waitFor(() => expect(patches().length).toBeGreaterThan(0));
  });

  it("locks a stop, and a locked stop offers nothing but unlocking", async () => {
    const user = u();
    state.items = [stop("Louvre", 1, 0), stop("Lunch", 1, 1, { locked: true }), stop("Seine walk", 1, 2)];
    show({ initialItems: state.items as never });
    const dialog = await openOptions(user, "Lunch");
    expect(within(dialog).getByRole("button", { name: "Unlock" })).toBeTruthy();
    for (const name of [/Earlier/, /Later/, /day before/, /day after/, /Remove/]) expect(within(dialog).getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    expect(within(dialog).getByLabelText("Target time for Lunch").hasAttribute("disabled")).toBe(true);
  });

  it("removes a stop and offers to undo", async () => {
    const user = u();
    show();
    const dialog = await openOptions(user, "Lunch");
    await user.click(within(dialog).getByRole("button", { name: /Remove/ }));
    expect(await screen.findByText(/Lunch removed\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Lunch/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: /^Lunch/ })).toBeTruthy();
  });
});

describe("ItinerarySurface on a phone: adding", () => {
  it("opens a sheet for the day shown and adds the stop", async () => {
    api.handlers.push((c) => (c.method === "POST" ? { json: { item: stop("Sainte-Chapelle", 1, 3) } } : undefined));
    const user = u();
    show();
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    const dialog = screen.getByRole("dialog", { name: "Add a stop" });
    expect(within(dialog).getByText(/Add to .*Oct 10/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Add to the plan" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Add itinerary item"), { target: { value: "Sainte-Chapelle" } });
    await user.click(within(dialog).getByRole("button", { name: "Add to the plan" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "POST" && c.url.endsWith("/itinerary"))).toBe(true));
    expect(api.calls.find((c) => c.method === "POST" && c.url.endsWith("/itinerary"))!.body).toMatchObject({ title: "Sainte-Chapelle", dayIndex: 1 });
    expect(await screen.findByRole("button", { name: /^Sainte-Chapelle/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("adds to the empty day it is on", async () => {
    const user = u();
    show();
    await user.click(within(screen.getByRole("group", { name: "Days" })).getAllByRole("button")[2]);
    await user.click(screen.getByRole("button", { name: /Plan this day/ }));
    expect(screen.getByRole("dialog", { name: "Add a stop" }).textContent).toMatch(/Add to .*Oct 12/);
  });
});
