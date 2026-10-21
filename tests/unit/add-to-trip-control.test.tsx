// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the control that puts a place on the trip: its states (not in, shortlisted, on a day), the day menu,
 * writes that answer at once and settle in order, how a failed write is put right, and the separate save button.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let tripData: Any | null;
let guest = false;
let writes: Array<{ url: string; body: Any; announce?: string[]; resolve: (r: { ok: boolean; queued?: boolean }) => void }>;
let autoReply: ((url: string, body: Any) => { ok: boolean; queued?: boolean }) | null;
const toast = vi.fn();
const openGate = vi.fn();
const onChange = vi.fn();

vi.mock("motion/react", () => ({
  motion: { div: React.forwardRef(function MotionDiv({ children, initial, animate, exit, transition, ...rest }: Any, ref) { void initial; void animate; void exit; void transition; return <div ref={ref as never} {...rest}>{children}</div>; }), span: ({ children }: Any) => <span>{children}</span> },
  AnimatePresence: ({ children }: Any) => <>{children}</>,
  useReducedMotion: () => true,
}));
vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => (tripData ? { data: tripData } : null) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest, openGate }) }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/lib/client/mutation-queue", () => ({
  mutate: (url: string, init: Any) => {
    if (autoReply) return Promise.resolve(autoReply(url, init.body));
    return new Promise((resolve) => writes.push({ url, body: init.body, announce: init.announce, resolve: resolve as never }));
  },
}));

import { AddToTripControl } from "../../features/trip/ui/AddToTripControl";

const place = { provider: "google-places", providerId: "p1", name: "Louvre", category: "museum", latitude: 48.86, longitude: 2.34 } as never;
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const control = (props: Any = {}) => render(<AddToTripControl tripId={TRIP} place={place} {...props} />);
const main = () => screen.getByRole("button", { name: /(itinerary day|day menu) for Louvre/ });
const td = () => tripData as Any;
const save = () => screen.getByRole("button", { name: /Louvre (from saved places|$)|Save Louvre/ });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  tripData = { trip: { duration_days: 3 }, itinerary: [], savedPlaces: [] };
  guest = false; writes = []; autoReply = null;
  [toast, openGate, onChange].forEach((m) => m.mockClear());
  Element.prototype.getBoundingClientRect = function () { return { top: 100, bottom: 140, left: 0, right: 300, width: 300, height: 40, x: 0, y: 100, toJSON() {} } as DOMRect; };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("AddToTripControl: what it shows", () => {
  it("offers to add a place that is not in the trip, with the save button beside it", () => {
    control();
    expect(main().textContent).toContain("Add to trip");
    expect(screen.getByRole("button", { name: "Save Louvre" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("is shorter on a small card", () => {
    control({ size: "sm" });
    expect(main().textContent).toContain("Add");
    expect(main().textContent).not.toContain("Add to trip");
  });

  it("says which day a place is on, matching the itinerary by name", () => {
    td().itinerary = [{ title: "  LOUVRE ", day_index: 2 }];
    control();
    expect(main().textContent).toContain("Day 2");
  });

  it("shows a place on the shortlist as saved, but not yet on a day", () => {
    td().savedPlaces = [{ places: { provider_id: "p1" } }];
    control();
    expect(main().textContent).toContain("Add to trip");
    expect(screen.getByRole("button", { name: "Remove Louvre from saved places" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reads saved places stored under other shapes", () => {
    td().savedPlaces = [{ providerId: "p1" }];
    control();
    expect(screen.getByRole("button", { name: "Remove Louvre from saved places" })).toBeTruthy();
    cleanup();
    td().savedPlaces = [{ provider_id: "p1" }];
    control();
    expect(screen.getByRole("button", { name: "Remove Louvre from saved places" })).toBeTruthy();
  });

  it("takes an explicit starting placement over the trip's own", () => {
    td().itinerary = [{ title: "Louvre", day_index: 2 }];
    control({ initialPlacement: { dayIndex: 3 } });
    expect(main().textContent).toContain("Day 3");
  });

  it("works with no trip in context", () => {
    tripData = null;
    control();
    expect(main().textContent).toContain("Add to trip");
  });

  it("leaves the save button out when asked, and for the round variant", () => {
    control({ noSave: true });
    expect(screen.queryByRole("button", { name: /Save Louvre/ })).toBeNull();
    cleanup();
    control({ variant: "orb" });
    expect(screen.queryByRole("button", { name: /Save Louvre/ })).toBeNull();
    expect(main().textContent).toBe("");
  });

  it("shows the day inside the round variant once planned", () => {
    td().itinerary = [{ title: "Louvre", day_index: 2 }];
    control({ variant: "orb" });
    expect(main().textContent).toContain("Day 2");
  });
});

describe("AddToTripControl: the day menu", () => {
  it("lists a day for each day of the trip, with the current one marked", async () => {
    td().itinerary = [{ title: "Louvre", day_index: 2 }];
    const user = u();
    control();
    await user.click(main());
    const menu = await screen.findByRole("menu");
    const days = within(menu).getAllByRole("menuitemradio");
    expect(days.map((d) => d.textContent)).toEqual(["Day 1", "Day 2", "Day 3"]);
    expect(days.map((d) => d.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(main().getAttribute("aria-expanded")).toBe("true");
  });

  it("covers days beyond the trip's length that already have something on them, up to 30", async () => {
    tripData = { trip: { duration_days: 2 }, itinerary: [{ title: "Other", day_index: 5 }], savedPlaces: [] };
    const user = u();
    control();
    await user.click(main());
    expect(within(await screen.findByRole("menu")).getAllByRole("menuitemradio")).toHaveLength(5);
    cleanup();
    tripData = { trip: { duration_days: 90 }, itinerary: [], savedPlaces: [] };
    control();
    await user.click(main());
    expect(within(await screen.findByRole("menu")).getAllByRole("menuitemradio")).toHaveLength(30);
  });

  it("offers a single 'Add to itinerary' row when the trip has no length yet", async () => {
    tripData = { trip: {}, itinerary: [], savedPlaces: [] };
    const user = u();
    control();
    await user.click(main());
    expect(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /Add to itinerary/ })).toBeTruthy();
  });

  it("offers to remove it only when it is on a day", async () => {
    const user = u();
    control();
    await user.click(main());
    expect(screen.queryByRole("menuitem", { name: /Remove from itinerary/ })).toBeNull();
    cleanup();
    td().itinerary = [{ title: "Louvre", day_index: 1 }];
    control();
    await user.click(main());
    expect(await screen.findByRole("menuitem", { name: /Remove from itinerary/ })).toBeTruthy();
  });

  it("closes on Escape, on a tap outside, and on scroll or resize", async () => {
    const user = u();
    control();
    await user.click(main());
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(main());
    await screen.findByRole("menu");
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(main());
    await screen.findByRole("menu");
    act(() => { window.dispatchEvent(new Event("resize")); });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.click(main());
    await screen.findByRole("menu");
    act(() => { window.dispatchEvent(new Event("scroll")); });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("opens upward when there is little room below, else downward, kept on screen", async () => {
    const user = u();
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
    control();
    await user.click(main());
    const down = await screen.findByRole("menu");
    expect(down.style.top).toBe("146px");
    expect(down.style.left).toBe("60px"); // right edge (300) minus the menu's 240px
    cleanup();
    Element.prototype.getBoundingClientRect = function () { return { top: 650, bottom: 690, left: 0, right: 200, width: 200, height: 40, x: 0, y: 650, toJSON() {} } as DOMRect; };
    control();
    await user.click(main());
    const up = await screen.findByRole("menu");
    expect(up.style.bottom).toBe("156px"); // the window height (800) minus the control's top (650) less a 6px gap
    expect(up.style.left).toBe("8px");
  });
});

describe("AddToTripControl: putting it on a day", () => {
  it("answers at once and writes the placement, then says it is done", async () => {
    const user = u();
    control({ onPlacementChange: onChange });
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 2" }));
    expect(main().textContent).toContain("Day 2");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ url: `/api/trips/${TRIP}/places/placement`, body: { place, placement: { dayIndex: 2 } }, announce: ["places", "itinerary"] });
    await act(async () => { writes[0].resolve({ ok: true }); });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre added to Day 2.", "success"));
    expect(onChange).toHaveBeenCalledWith({ dayIndex: 2 });
  });

  it("does nothing for the day it is already on", async () => {
    td().itinerary = [{ title: "Louvre", day_index: 2 }];
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 2" }));
    expect(writes).toHaveLength(0);
  });

  it("takes it off the itinerary", async () => {
    td().itinerary = [{ title: "Louvre", day_index: 2 }];
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitem", { name: /Remove from itinerary/ }));
    expect(main().textContent).toContain("Add to trip");
    expect(writes[0].body.placement).toBe("none");
    await act(async () => { writes[0].resolve({ ok: true }); });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Removed Louvre from the trip.", "success"));
  });

  it("says a write is saved for later when offline", async () => {
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 1" }));
    await act(async () => { writes[0].resolve({ ok: true, queued: true }); });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre — saved, will sync when you're back online.", "info"));
  });

  it("goes back to what the server last confirmed when a write fails", async () => {
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 3" }));
    expect(main().textContent).toContain("Day 3");
    await act(async () => { writes[0].resolve({ ok: false }); });
    await waitFor(() => expect(main().textContent).toContain("Add to trip"));
    expect(toast).toHaveBeenCalledWith("Couldn’t update Louvre. Try again.", "error");
  });

  it("sends a second change after the first has landed, in order", async () => {
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 1" }));
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 2" }));
    expect(main().textContent).toContain("Day 2");
    expect(writes).toHaveLength(1);
    await act(async () => { writes[0].resolve({ ok: true }); });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].body.placement).toEqual({ dayIndex: 2 });
    await act(async () => { writes[1].resolve({ ok: true }); });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre added to Day 2.", "success"));
  });

  it("keeps the newer choice on screen when an earlier write fails behind it", async () => {
    const user = u();
    control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 1" }));
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 2" }));
    await act(async () => { writes[0].resolve({ ok: false }); });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(main().textContent).toContain("Day 2");
  });

  it("asks a guest for an account instead of opening the menu", async () => {
    guest = true;
    const user = u();
    control();
    await user.click(main());
    expect(openGate).toHaveBeenCalledWith("add places to a trip");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AddToTripControl: saving a place", () => {
  it("saves at once and says so", async () => {
    autoReply = () => ({ ok: true });
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Save Louvre" }));
    expect(screen.getByRole("button", { name: "Remove Louvre from saved places" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre saved.", "success"));
  });

  it("sends the bookmark with the place and what to do", async () => {
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Save Louvre" }));
    expect(writes[0]).toMatchObject({ url: `/api/trips/${TRIP}/places/bookmark`, body: { place, saved: true }, announce: ["places"] });
    await act(async () => { writes[0].resolve({ ok: true }); });
  });

  it("takes a saved place back out", async () => {
    td().savedPlaces = [{ places: { provider_id: "p1" } }];
    autoReply = () => ({ ok: true });
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Remove Louvre from saved places" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Louvre removed from saved places.", "success"));
    expect(screen.getByRole("button", { name: "Save Louvre" })).toBeTruthy();
  });

  it("puts the heart back when it could not be saved", async () => {
    autoReply = () => ({ ok: false });
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Save Louvre" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t update Louvre. Try again.", "error"));
    expect(screen.getByRole("button", { name: "Save Louvre" })).toBeTruthy();
  });

  it("is busy while saving, so a second tap cannot double it", async () => {
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Remove Louvre from saved places".replace("Remove Louvre from saved places", "Save Louvre") }));
    expect(screen.getByRole("button", { name: "Remove Louvre from saved places" }).hasAttribute("disabled")).toBe(true);
    expect(main().hasAttribute("disabled")).toBe(true);
    await act(async () => { writes[0].resolve({ ok: true }); });
    await flush();
  });

  it("asks a guest for an account instead of saving", async () => {
    guest = true;
    const user = u();
    control();
    await user.click(screen.getByRole("button", { name: "Save Louvre" }));
    expect(openGate).toHaveBeenCalledWith("save places");
    expect(writes).toHaveLength(0);
  });
});

describe("AddToTripControl: staying in step with the trip", () => {
  it("follows the trip when it changes and nothing of ours is in flight", async () => {
    const view = control();
    expect(main().textContent).toContain("Add to trip");
    tripData = { trip: { duration_days: 3 }, itinerary: [{ title: "Louvre", day_index: 2 }], savedPlaces: [] };
    view.rerender(<AddToTripControl tripId={TRIP} place={place} />);
    await waitFor(() => expect(main().textContent).toContain("Day 2"));
  });

  it("does not let a late refresh overwrite a change that has just been made", async () => {
    const user = u();
    const view = control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 3" }));
    await act(async () => { writes[0].resolve({ ok: true }); });
    // A snapshot rendered between two quick changes can arrive late, still showing the old answer.
    tripData = { trip: { duration_days: 3 }, itinerary: [{ title: "Louvre", day_index: 1 }], savedPlaces: [] };
    view.rerender(<AddToTripControl tripId={TRIP} place={place} />);
    await flush();
    expect(main().textContent).toContain("Day 3");
  });

  it("does not let a refresh overwrite a change that is still being written", async () => {
    const user = u();
    const view = control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 3" }));
    tripData = { trip: { duration_days: 3 }, itinerary: [{ title: "Louvre", day_index: 1 }], savedPlaces: [] };
    view.rerender(<AddToTripControl tripId={TRIP} place={place} />);
    await flush();
    expect(main().textContent).toContain("Day 3");
    await act(async () => { writes[0].resolve({ ok: true }); });
  });

  it("takes the trip's word again a few seconds after its last write", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
    const view = control();
    await user.click(main());
    await user.click(await screen.findByRole("menuitemradio", { name: "Day 3" }));
    await act(async () => { writes[0].resolve({ ok: true }); });
    await act(async () => { vi.advanceTimersByTime(5000); });
    tripData = { trip: { duration_days: 3 }, itinerary: [{ title: "Louvre", day_index: 1 }], savedPlaces: [] };
    view.rerender(<AddToTripControl tripId={TRIP} place={place} />);
    await waitFor(() => expect(main().textContent).toContain("Day 1"));
  });
});
