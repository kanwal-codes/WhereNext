// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceWorkspaceChange, subscribeWorkspaceChanges } from "../../lib/application/workspace-events";
import { TRIP, booking, createApi, matchMedia, stop, stubBrowser } from "../support/itinerary-harness";

/**
 * Characterization tests for the itinerary screen on a desktop: what a traveller sees and which requests each action sends,
 * with the network faked. They pin today's behaviour so the screen's internals can be reorganised without changing it.
 */
const toast = vi.fn();
const openPanel = vi.fn();
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
let state: { items: ReturnType<typeof stop>[]; reservations: ReturnType<typeof booking>[]; places?: unknown[] };
let changes: string[];
let unsubscribe: () => void;

const show = (props: Partial<React.ComponentProps<typeof ItinerarySurface>> = {}) =>
  render(<ItinerarySurface tripId={TRIP} initialItems={state.items as never} plannedDays={3} {...props} />);
const row = (title: string) => screen.getByText(title).closest(".group") as HTMLElement;
const patches = () => api.ofMethod("PATCH");

beforeEach(() => {
  toast.mockClear();
  openPanel.mockClear();
  state = { items: [stop("Louvre", 1, 0), stop("Lunch", 1, 1), stop("Seine walk", 1, 2), stop("Orsay", 2, 0)], reservations: [] };
  api = createApi(state);
  stubBrowser();
  window.matchMedia = matchMedia(false);
  changes = [];
  unsubscribe = subscribeWorkspaceChanges((c) => changes.push(...c));
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.unstubAllGlobals();
});

describe("ItinerarySurface: what it shows", () => {
  it("lists every planned day, with its stops in plan order and a count", () => {
    show();
    expect(screen.getByRole("heading", { name: "Day 1" })).toBeTruthy();
    expect(screen.getByText("3 stops")).toBeTruthy();
    expect(screen.getByText("1 stop")).toBeTruthy();
    expect(screen.getByText("Open day")).toBeTruthy();
    expect(screen.getByText("Nothing planned.", { exact: false })).toBeTruthy();
    const titles = screen.getAllByRole("button", { name: /^(Louvre|Lunch|Seine walk)/ }).map((b) => b.textContent?.trim());
    expect(titles).toEqual(["Louvre", "Lunch", "Seine walk"]);
  });

  it("dates each day from the start date", () => {
    show({ startDate: "2026-10-10" });
    expect(screen.getAllByText(/Oct/).length).toBeGreaterThan(0);
  });

  it("loads the stops itself when none were handed in", async () => {
    state.items = [stop("Fetched stop", 1, 0)];
    render(<ItinerarySurface tripId={TRIP} plannedDays={1} />);
    await screen.findByText("Fetched stop");
  });

  it("toasts when that load cannot reach the server (an HTTP error answer shows an empty plan without a word)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ItinerarySurface tripId={TRIP} plannedDays={1} />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t load the itinerary.", "error"));
  });

  it("picks up a collaborator's change handed in as new items", () => {
    const view = show();
    view.rerender(<ItinerarySurface tripId={TRIP} initialItems={[stop("Added elsewhere", 1, 0)] as never} plannedDays={3} />);
    expect(screen.getByText("Added elsewhere")).toBeTruthy();
  });

  it("shows the booked stay under 'Based at'", () => {
    show({ lockedStay: { hotelName: "Hotel Lutetia", checkin: "2026-10-10", checkout: "2026-10-14", thumbnail: null } as never });
    expect(screen.getByText("Based at")).toBeTruthy();
    expect(screen.getByText("Hotel Lutetia")).toBeTruthy();
  });

  it("shows bookings on their day, and re-reads them when a decision changes", async () => {
    state.reservations = [booking()];
    show({ startDate: "2026-10-10" });
    expect(await screen.findByLabelText("Booked on day 1")).toBeTruthy();
    expect(screen.getByText("Food tour")).toBeTruthy();
    state.reservations = [booking(), booking({ id: "r2", title: "Dinner", startsOn: "2026-10-11", startTime: "20:00" })];
    await act(async () => announceWorkspaceChange("decision"));
    expect(await screen.findByLabelText("Booked on day 2")).toBeTruthy();
  });

  it("warns when two things on a day are within an hour of each other", async () => {
    state.items = [stop("Museum", 1, 0, { time: "10:30" })];
    state.reservations = [booking()];
    show({ startDate: "2026-10-10", initialItems: state.items as never });
    const clash = await screen.findByLabelText("Scheduling clashes on day 1");
    expect(clash.textContent).toContain("Food tour");
    expect(clash.textContent).toContain("Museum");
  });
});

describe("ItinerarySurface: adding", () => {
  const openAddOnDay = async (u: ReturnType<typeof userEvent.setup>, n: number) => {
    await u.click(screen.getAllByRole("button", { name: /Add here/ })[n - 1]);
  };

  it("adds a typed stop to the chosen day, appends it, and closes the form", async () => {
    api.handlers.push((c) => (c.method === "POST" ? { json: { item: stop("Dinner", 2, 1) } } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await openAddOnDay(u, 2);
    await u.type(screen.getByLabelText("Add itinerary item"), "Dinner");
    await u.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("Dinner");
    expect(api.ofMethod("POST")[0].body).toEqual({ title: "Dinner", dayIndex: 2, providerId: undefined });
    expect(screen.queryByLabelText("Add itinerary item")).toBeNull();
    expect(changes).toContain("itinerary");
  });

  it("attaches the place id of a picked suggestion, but not once the text is edited", async () => {
    api.handlers.push((c) => (c.method === "POST" ? { json: { item: stop("x", 1, 3) } } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await openAddOnDay(u, 1);
    await u.click(screen.getByRole("button", { name: "pick suggestion" }));
    await u.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.ofMethod("POST")).toHaveLength(1));
    expect(api.ofMethod("POST")[0].body).toEqual({ title: "Louvre Museum", dayIndex: 1, providerId: "place-louvre" });

    await openAddOnDay(u, 1);
    await u.click(screen.getByRole("button", { name: "pick suggestion" }));
    await u.type(screen.getByLabelText("Add itinerary item"), "!");
    await u.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.ofMethod("POST")).toHaveLength(2));
    expect(api.ofMethod("POST")[1].body).toEqual({ title: "Louvre Museum!", dayIndex: 1, providerId: undefined });
  });

  it("puts the words back and says so when the add fails", async () => {
    api.handlers.push((c) => (c.method === "POST" ? { status: 500 } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await openAddOnDay(u, 1);
    await u.type(screen.getByLabelText("Add itinerary item"), "Catacombs");
    await u.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t add that item.", "error"));
    expect((screen.getByLabelText("Add itinerary item") as HTMLInputElement).value).toBe("Catacombs");
  });

  it("tells you when adding a place moved it from another day, and offers a second visit", async () => {
    let posts = 0;
    api.handlers.push((c) => {
      if (c.method !== "POST") return undefined;
      posts += 1;
      return posts === 1 ? { json: { item: stop("Orsay", 3, 0), moved: true, fromDay: 2 } } : { json: { item: stop("Orsay (visit 2)", 3, 1) } };
    });
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await openAddOnDay(u, 3);
    await u.type(screen.getByLabelText("Add itinerary item"), "Orsay");
    await u.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toBe("Orsay was already on Day 2, so it moved to Day 3.");
    expect(toast.mock.calls[0][2]).toMatchObject({ label: "Visit it on both days" });
    await act(async () => toast.mock.calls[0][2].onClick());
    await waitFor(() => expect(api.ofMethod("POST")).toHaveLength(3));
    expect(api.ofMethod("POST")[1].body).toMatchObject({ title: "Orsay", dayIndex: 2 });
    expect(api.ofMethod("POST")[2].body).toMatchObject({ title: "Orsay", dayIndex: 3, repeat: true });
  });

  it("ignores an empty title", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await openAddOnDay(u, 1);
    await u.click(screen.getByRole("button", { name: "Add" }));
    expect(api.ofMethod("POST")).toHaveLength(0);
  });
});

describe("ItinerarySurface: changing a stop", () => {
  it("moves a stop later in its day and tells the server the new order", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Louvre")).getByRole("button", { name: "Move Louvre later in the day" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ order: [{ title: "Lunch", dayIndex: 1, position: 0 }, { title: "Louvre", dayIndex: 1, position: 1 }, { title: "Seine walk", dayIndex: 1, position: 2 }] });
    const titles = screen.getAllByRole("button", { name: /^(Louvre|Lunch|Seine walk)/ }).map((b) => b.textContent?.trim());
    expect(titles).toEqual(["Lunch", "Louvre", "Seine walk"]);
    await waitFor(() => expect(changes).toContain("itinerary"));
  });

  it("cannot move the first stop earlier or the last later", () => {
    show();
    expect((within(row("Louvre")).getByRole("button", { name: "Move Louvre earlier in the day" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(row("Seine walk")).getByRole("button", { name: "Move Seine walk later in the day" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves a stop to the next day", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Seine walk")).getByRole("button", { name: "Move to next day" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body!.order).toContainEqual(expect.objectContaining({ title: "Seine walk", dayIndex: 2 }));
  });

  it("does not move a stop before day 1", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Louvre")).getByRole("button", { name: "Move to previous day" }));
    expect(patches()).toHaveLength(0);
  });

  it("puts the old order back, and says so, when a move cannot be saved", async () => {
    api.handlers.push((c) => (c.method === "PATCH" ? { status: 500 } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Louvre")).getByRole("button", { name: "Move Louvre later in the day" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That change couldn’t be saved.", "error"));
    const titles = screen.getAllByRole("button", { name: /^(Louvre|Lunch|Seine walk)/ }).map((b) => b.textContent?.trim());
    expect(titles).toEqual(["Louvre", "Lunch", "Seine walk"]);
  });

  it("says to unlock first when the server refuses a locked stop", async () => {
    api.handlers.push((c) => (c.method === "PATCH" ? { status: 409 } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Louvre")).getByRole("button", { name: "Move Louvre later in the day" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Unlock the item first.", "error"));
  });

  it("locks a stop, and a locked stop cannot be moved, removed, or given a time", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Lunch")).getByRole("button", { name: "Lock" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ title: "Lunch", locked: true });
    const lunch = row("Lunch");
    expect(within(lunch).getByRole("button", { name: "Unlock" })).toBeTruthy();
    expect((within(lunch).getByRole("button", { name: "Remove" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(lunch).getByRole("button", { name: "Move to next day" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(lunch).getByLabelText("Target time for Lunch") as HTMLInputElement).disabled).toBe(true);
  });

  it("does not let the neighbour of a locked stop swap with it", async () => {
    state.items = [stop("A", 1, 0, { locked: true }), stop("B", 1, 1)];
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show({ initialItems: state.items as never });
    await u.click(within(row("B")).getByRole("button", { name: "Move B earlier in the day" }));
    expect(toast).toHaveBeenCalledWith("The item next to it is locked.", "error");
    expect(patches()).toHaveLength(0);
  });

  it("sets and clears a target time", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    const input = within(row("Lunch")).getByLabelText("Target time for Lunch");
    fireEvent.change(input, { target: { value: "12:30" } });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ title: "Lunch", time: "12:30" });
    fireEvent.change(within(row("Lunch")).getByLabelText("Target time for Lunch"), { target: { value: "" } });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toEqual({ title: "Lunch", time: null });
    void u;
  });
});

describe("ItinerarySurface: removing", () => {
  it("removes a stop at once, tells the server, and offers Undo", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Lunch")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.ofMethod("DELETE")).toHaveLength(1));
    expect(api.ofMethod("DELETE")[0].body).toEqual({ title: "Lunch" });
    expect(screen.getByRole("status").textContent).toContain("Lunch removed.");
  });

  it("brings the stop back on Undo", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Lunch")).getByRole("button", { name: "Remove" }));
    await u.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(patches().some((p) => p.body?.restore === true)).toBe(true));
    expect(patches().find((p) => p.body?.restore)!.body).toEqual({ title: "Lunch", restore: true });
    expect(await screen.findByText("Lunch", { selector: "button" })).toBeTruthy();
  });

  it("puts the stop back and says so when the removal fails", async () => {
    api.handlers.push((c) => (c.method === "DELETE" ? { status: 500 } : undefined));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(within(row("Lunch")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t remove that item.", "error"));
    expect(screen.getByText("Lunch", { selector: "button" })).toBeTruthy();
    expect(screen.queryByText(/Lunch removed/)).toBeNull();
  });
});

describe("ItinerarySurface: opening a place", () => {
  it("opens the panel straight away for a stop that came from a real place", async () => {
    state.items = [stop("Louvre", 1, 0, { provider_id: "prov-1" })];
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show({ initialItems: state.items as never });
    await u.click(screen.getByText("Louvre"));
    expect(openPanel).toHaveBeenCalledWith({ kind: "place", placeId: "prov-1", name: "Louvre" });
  });

  it("looks a typed stop up by name, in the trip's city, then opens the first hit", async () => {
    state.places = [{ providerId: "found-1" }];
    api = createApi(Object.assign(state, { places: [{ providerId: "found-1" }] }));
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show({ destination: "Paris" });
    await u.click(screen.getByText("Lunch"));
    await waitFor(() => expect(openPanel).toHaveBeenCalledWith({ kind: "place", placeId: "found-1", name: "Lunch" }));
    expect(api.calls.find((c) => c.url.includes("/places?query="))!.url).toContain(encodeURIComponent("Lunch, Paris"));
  });

  it("says so when no details can be found", async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show();
    await u.click(screen.getByText("Lunch"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t find details for Lunch.", "info"));
    expect(openPanel).not.toHaveBeenCalled();
  });
});

describe("ItinerarySurface: placing a moved stop where it was dropped", () => {
  it("puts a stop moved to the next day last on that day, whatever position it had on its own day", async () => {
    state.items = [stop("Louvre", 1, 0), stop("Lunch", 1, 1), stop("Orsay", 2, 0), stop("Rodin", 2, 1)];
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    show({ initialItems: state.items as never });
    await u.click(within(row("Louvre")).getByRole("button", { name: "Move to next day" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body!.order).toEqual([
      { title: "Orsay", dayIndex: 2, position: 0 },
      { title: "Rodin", dayIndex: 2, position: 1 },
      { title: "Louvre", dayIndex: 2, position: 2 },
      { title: "Lunch", dayIndex: 1, position: 0 },
    ]);
  });

  it("reorders within a day by dragging a stop onto another", async () => {
    show();
    fireEvent.dragStart(within(row("Seine walk")).getByRole("button", { name: "Drag to reorder" }));
    fireEvent.dragOver(row("Louvre"));
    fireEvent.drop(row("Louvre"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body!.order).toEqual([
      { title: "Seine walk", dayIndex: 1, position: 0 },
      { title: "Louvre", dayIndex: 1, position: 1 },
      { title: "Lunch", dayIndex: 1, position: 2 },
    ]);
  });

  it("drops a stop onto another day's stop to sit just before it, and into an empty day", async () => {
    show();
    fireEvent.dragStart(within(row("Louvre")).getByRole("button", { name: "Drag to reorder" }));
    fireEvent.dragOver(row("Orsay"));
    fireEvent.drop(row("Orsay"));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect((patches()[0].body!.order as unknown[]).slice(0, 2)).toEqual([{ title: "Louvre", dayIndex: 2, position: 0 }, { title: "Orsay", dayIndex: 2, position: 1 }]);

    const day3 = document.getElementById("day-3")!;
    fireEvent.dragStart(within(row("Orsay")).getByRole("button", { name: "Drag to reorder" }));
    fireEvent.dragOver(day3);
    fireEvent.drop(day3);
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body!.order).toContainEqual({ title: "Orsay", dayIndex: 3, position: 0 });
  });

  it("will not drag a locked stop", () => {
    state.items = [stop("Fixed", 1, 0, { locked: true }), stop("Free", 1, 1)];
    show({ initialItems: state.items as never });
    expect(within(row("Fixed")).getByRole("button", { name: "Drag to reorder" }).getAttribute("draggable")).toBe("false");
  });
});
