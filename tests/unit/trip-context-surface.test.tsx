// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeWorkspaceChanges } from "../../lib/application/workspace-events";

/**
 * Characterization tests for the "What we know" panel: how the trip's facts are sorted into locked in / needs your call /
 * still open, and which request each edit, confirm and dismiss sends. Network and heavy children are faked.
 */
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const toast = vi.fn();
const openGate = vi.fn();
let guestState = { guest: false };

vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest: guestState.guest, openGate }) }));
vi.mock("@/lib/application/bookings-outside-notice", () => ({ noticeBookingsOutside: () => undefined }));
vi.mock("@/components/DestinationCombobox", () => ({
  DestinationCombobox: ({ value, onChange, onSelect }: { value: string; onChange: (v: string) => void; onSelect: (v: string) => void }) => (
    <div><input aria-label="Destination" value={value} onChange={(e) => onChange(e.target.value)} /><button type="button" onClick={() => onSelect(value)}>pick destination</button></div>
  ),
}));
vi.mock("@/components/DateRangeField", () => ({
  DateRangeField: ({ start, end, onChange }: { start: string; end: string; onChange: (s: string, e: string) => void }) => (
    <div>
      <span data-testid="range">{start}|{end}</span>
      <button type="button" onClick={() => onChange("2026-12-01", "2026-12-08")}>choose week</button>
      <button type="button" onClick={() => onChange("2026-12-08", "2026-12-01")}>choose backwards</button>
    </div>
  ),
}));

import { TripContextSurface } from "../../features/workspace/ui/TripContextSurface";

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[];
let handlers: Array<(c: Call) => { status?: number; json?: unknown } | undefined>;
let memoryOnServer: Record<string, unknown>;
let decisionsOnServer: unknown[];
let changes: string[];
let unsubscribe: () => void;

const tripData = { id: TRIP_ID, name: "Lisbon", destination: "Lisbon", duration_days: 7, travelers: 2, start_date: "2026-12-01", end_date: "2026-12-08" };
const baseTrip = tripData as never;
const sugg = (key: string, display: string, rationale = "") => ({ id: `s-${key}`, kind: "suggestion", source: "assistant", value: { key, display, rationale }, created_at: "2026-10-01T00:00:00Z" });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const out = h(call);
      if (out) return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
    }
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (call.url.endsWith("/memory")) return json({ memory: memoryOnServer });
    if (call.url.endsWith("/decisions")) return json({ decisions: decisionsOnServer });
    return json({});
  }));
}
const put = () => calls.filter((c) => c.method === "PUT" && c.url.endsWith("/memory"));
const patchTrip = () => calls.filter((c) => c.method === "PATCH" && c.url.endsWith(`/api/trips/${TRIP_ID}`));
const show = (props: Partial<React.ComponentProps<typeof TripContextSurface>> = {}) =>
  render(<TripContextSurface tripId={TRIP_ID} trip={baseTrip} initialMemory={{}} initialDecisions={[]} {...props} />);

beforeEach(() => {
  toast.mockClear();
  openGate.mockClear();
  guestState = { guest: false };
  handlers = [];
  memoryOnServer = {};
  decisionsOnServer = [];
  installFetch();
  changes = [];
  unsubscribe = subscribeWorkspaceChanges((c) => changes.push(...c));
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.unstubAllGlobals();
});

const tileFor = (label: string) => screen.getByText(label, { selector: "p" }).closest("div.group\\/row") as HTMLElement;

describe("TripContextSurface: what it shows", () => {
  it("counts what is locked in, what needs a call, and what is still open", () => {
    show({ initialDecisions: [sugg("pace", "Relaxed", "You said slow mornings")] as never });
    const header = screen.getByRole("heading", { name: "What we know" }).parentElement!;
    expect(header.textContent).toMatch(/4 locked in/);
    expect(header.textContent).toMatch(/1 needs you/);
    expect(header.textContent).toMatch(/\d+ still open/);
  });

  it("says nothing is locked in on an empty trip", () => {
    show({ trip: null });
    expect(screen.getByText("Nothing locked in yet")).toBeTruthy();
  });

  it("locks in the trip's own facts: destination, length, travellers, dates", () => {
    show();
    expect(tileFor("Destination").textContent).toContain("Lisbon");
    expect(tileFor("Trip length").textContent).toContain("7 days");
    expect(tileFor("Travellers").textContent).toContain("2");
    expect(tileFor("Dates").textContent).toMatch(/Dec/);
  });

  it("writes a plain budget number in the trip's money", () => {
    show({ initialMemory: { budget: 120, currency: "EUR" } });
    expect(tileFor("Budget").textContent).toMatch(/€\s?120/);
  });

  // Regression: the row carried the note "per person, a day" but only suggestions rendered their note, so a bare number never said what it was per.
  it("says what a plain budget number is per", () => {
    show({ initialMemory: { budget: 120, currency: "EUR" } });
    expect(tileFor("Budget").textContent).toContain("per person, a day");
  });

  it("shows other preferences from memory, joining lists", () => {
    show({ initialMemory: { pace: "relaxed", interests: ["food", "art"], dislikes: ["museums"], dietaryNeeds: ["vegan"] } });
    expect(tileFor("Pace").textContent).toContain("relaxed");
    expect(tileFor("Interests").textContent).toContain("food, art");
    expect(tileFor("Avoid").textContent).toContain("museums");
    expect(tileFor("Dietary").textContent).toContain("vegan");
  });

  it("counts a solo trip as one traveller when no headcount is set", () => {
    show({ trip: { ...tripData, travelers: null } as never, initialMemory: { groupType: "solo" } });
    expect(tileFor("Travellers").textContent).toContain("1 (solo)");
  });

  it("shows the booked stay, and other decisions the traveller made", () => {
    show({
      initialDecisions: [
        { id: "d1", kind: "stay", source: "user", value: { provider: "liteapi", hotelId: "h1", hotelName: "Hotel Lutetia", roomName: "Deluxe", board: null, refundable: true, checkin: "2026-12-01", checkout: "2026-12-08", nights: 7, nightlyAmount: 150, totalAmount: 1050, currency: "EUR", latitude: null, longitude: null, address: null, thumbnail: null }, created_at: "2026-10-01T00:00:00Z" },
        { id: "d2", kind: "stay_area", source: "user", value: "Alfama", created_at: "2026-10-01T00:00:00Z" },
        { id: "d3", kind: "dinner_spot", source: "user", value: "Taberna da Rua", created_at: "2026-10-01T00:00:00Z" },
      ] as never,
    });
    expect(tileFor("Where you're staying").textContent).toContain("Hotel Lutetia · Deluxe");
    expect(tileFor("Base neighbourhood").textContent).toContain("Alfama");
    expect(screen.getByText("dinner spot", { selector: "p" })).toBeTruthy();
  });

  it("puts assistant suggestions under 'Needs your call', with their reason", () => {
    show({ initialDecisions: [sugg("pace", "Relaxed", "You said slow mornings")] as never });
    const section = screen.getByText("Needs your call").closest("section")!;
    expect(section.textContent).toContain("Relaxed");
    expect(section.textContent).toContain("You said slow mornings");
  });

  it("lists what is still open as chips", () => {
    show();
    const open = screen.getByText(/Still open/).closest("section")!;
    expect(within(open).getByRole("button", { name: /Occasion/ })).toBeTruthy();
    expect(within(open).getByRole("button", { name: /Pace/ })).toBeTruthy();
  });

  it("loads memory and decisions itself when the page handed in neither", async () => {
    memoryOnServer = { pace: "packed" };
    decisionsOnServer = [];
    render(<TripContextSurface tripId={TRIP_ID} trip={baseTrip} />);
    await waitFor(() => expect(tileFor("Pace").textContent).toContain("packed"));
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining([`/api/trips/${TRIP_ID}/memory`, `/api/trips/${TRIP_ID}/decisions`]));
  });

  it("picks up new memory handed in after a collaborator's change", () => {
    const view = show({ initialMemory: { pace: "slow" } });
    view.rerender(<TripContextSurface tripId={TRIP_ID} trip={baseTrip} initialMemory={{ pace: "packed" }} initialDecisions={[]} />);
    expect(tileFor("Pace").textContent).toContain("packed");
  });
});

describe("TripContextSurface: suggestions", () => {
  it("locks a suggestion in, says so, re-reads the facts, and tells the other screens", async () => {
    const user = u();
    show({ initialDecisions: [sugg("pace", "Relaxed")] as never });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/suggestions"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/suggestions"))!.body).toEqual({ key: "pace", action: "confirm" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Locked in.", "success"));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/memory") && c.method === "GET")).toBe(true));
    await waitFor(() => expect(changes).toContain("preferences"));
  });

  it("dismisses a suggestion without a toast, announcing a decision change", async () => {
    const user = u();
    show({ initialDecisions: [sugg("pace", "Relaxed")] as never });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/suggestions"))?.body).toEqual({ key: "pace", action: "dismiss" }));
    await waitFor(() => expect(changes).toContain("decision"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("says so when a suggestion cannot be saved", async () => {
    handlers.push((c) => (c.url.endsWith("/suggestions") ? { status: 500 } : undefined));
    const user = u();
    show({ initialDecisions: [sugg("pace", "Relaxed")] as never });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That didn’t save. Try again.", "error"));
  });

  it("asks a guest to save the trip before they can confirm", async () => {
    guestState = { guest: true };
    const user = u();
    show({ initialDecisions: [sugg("pace", "Relaxed")] as never });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(openGate).toHaveBeenCalledWith("edit your trip details");
    expect(calls).toHaveLength(0);
  });
});

describe("TripContextSurface: editing a preference", () => {
  const edit = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
    await user.click(within(tileFor(label)).getByRole("button", { name: `Edit ${label}` }));
    return screen.findByRole("textbox");
  };

  it("saves text with Enter and shows the server's answer", async () => {
    handlers.push((c) => (c.method === "PUT" ? { json: { memory: { pace: "packed" } } } : undefined));
    const user = u();
    show({ initialMemory: { pace: "relaxed" } });
    const input = await edit(user, "Pace");
    expect((input as HTMLInputElement).value).toBe("relaxed");
    await user.clear(input);
    await user.type(input, "packed{Enter}");
    await waitFor(() => expect(put()).toHaveLength(1));
    expect(put()[0].body).toEqual({ pace: "packed" });
    await waitFor(() => expect(tileFor("Pace").textContent).toContain("packed"));
    expect(changes).toContain("preferences");
  });

  it("saves a list as separate entries, and a budget as a number", async () => {
    let memory: Record<string, unknown> = { interests: ["food"], budget: 100 };
    handlers.push((c) => { if (c.method !== "PUT") return undefined; memory = { ...memory, ...c.body }; return { json: { memory } }; });
    const user = u();
    show({ initialMemory: { interests: ["food"], budget: 100 } });
    const interests = await edit(user, "Interests");
    await user.clear(interests);
    await user.type(interests, "food, art ,  jazz{Enter}");
    await waitFor(() => expect(put()).toHaveLength(1));
    expect(put()[0].body).toEqual({ interests: ["food", "art", "jazz"] });
    const budget = await edit(user, "Budget");
    await user.clear(budget);
    await user.type(budget, "250{Enter}");
    await waitFor(() => expect(put()).toHaveLength(2));
    expect(put()[1].body).toEqual({ budget: 250 });
  });

  it("keeps a worded budget as text", async () => {
    handlers.push((c) => (c.method === "PUT" ? { json: { memory: {} } } : undefined));
    const user = u();
    show({ initialMemory: { budget: "moderate" } });
    const budget = await edit(user, "Budget");
    await user.type(budget, "{Enter}");
    await waitFor(() => expect(put()).toHaveLength(1));
    expect(put()[0].body).toEqual({ budget: "moderate" });
  });

  it("cancels with Escape and writes nothing", async () => {
    const user = u();
    show({ initialMemory: { pace: "relaxed" } });
    const input = await edit(user, "Pace");
    await user.type(input, "{Escape}");
    expect(put()).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says only the owner can change it when the save is refused", async () => {
    handlers.push((c) => (c.method === "PUT" ? { status: 403 } : undefined));
    const user = u();
    show({ initialMemory: { pace: "relaxed" } });
    const input = await edit(user, "Pace");
    await user.type(input, "!{Enter}");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Only the trip owner can change this.", "error"));
  });

  it("blocks a guest from editing", async () => {
    guestState = { guest: true };
    const user = u();
    show({ initialMemory: { pace: "relaxed" } });
    await user.click(within(tileFor("Pace")).getByRole("button", { name: "Edit Pace" }));
    expect(openGate).toHaveBeenCalledWith("edit your trip details");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens an editor from a 'still open' chip", async () => {
    const user = u();
    show();
    const open = screen.getByText(/Still open/).closest("section")!;
    await user.click(within(open).getByRole("button", { name: /Occasion/ }));
    expect(await screen.findByPlaceholderText(/birthday, honeymoon/)).toBeTruthy();
  });
});

describe("TripContextSurface: dates, destination and travellers", () => {
  it("saves a new date range to the trip", async () => {
    handlers.push((c) => (c.method === "PATCH" ? { json: { trip: {} } } : undefined));
    const user = u();
    show();
    await user.click(within(tileFor("Dates")).getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "choose week" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patchTrip()).toHaveLength(1));
    expect(patchTrip()[0].body).toEqual({ startDate: "2026-12-01", endDate: "2026-12-08" });
    await waitFor(() => expect(changes).toContain("preferences"));
  });

  it("refuses an end date before the start date", async () => {
    const user = u();
    show();
    await user.click(within(tileFor("Dates")).getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "choose backwards" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(toast).toHaveBeenCalledWith("The end date is before the start date.", "error");
    expect(patchTrip()).toHaveLength(0);
  });

  it("clears the dates", async () => {
    handlers.push((c) => (c.method === "PATCH" ? { json: {} } : undefined));
    const user = u();
    show();
    await user.click(within(tileFor("Dates")).getByRole("button", { name: "Edit Dates" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patchTrip()[0].body).toEqual({ startDate: null, endDate: null }));
  });

  it("changes the destination, and takes the server's spelling", async () => {
    handlers.push((c) => (c.method === "PATCH" ? { json: { trip: { destination: "Lisboa, Portugal" } } } : undefined));
    const user = u();
    show();
    await user.click(within(tileFor("Destination")).getByRole("button", { name: "Edit Destination" }));
    const input = await screen.findByLabelText("Destination");
    await user.clear(input);
    await user.type(input, "Lisboa");
    await user.click(screen.getByRole("button", { name: "pick destination" }));
    await waitFor(() => expect(patchTrip()).toHaveLength(1));
    expect(patchTrip()[0].body).toEqual({ destination: "Lisboa" });
    await waitFor(() => expect(tileFor("Destination").textContent).toContain("Lisboa, Portugal"));
  });

  it("changes the number of travellers, and rejects a non-number", async () => {
    handlers.push((c) => (c.method === "PATCH" ? { json: { trip: { travelers: 4 } } } : undefined));
    const user = u();
    show();
    await user.click(within(tileFor("Travellers")).getByRole("button", { name: "Edit Travellers" }));
    const input = await screen.findByPlaceholderText("How many of you");
    await user.clear(input);
    await user.type(input, "4{Enter}");
    await waitFor(() => expect(patchTrip()).toHaveLength(1));
    expect(patchTrip()[0].body).toEqual({ travelerCount: 4 });
    await user.click(within(tileFor("Travellers")).getByRole("button", { name: "Edit Travellers" }));
    const again = await screen.findByPlaceholderText("How many of you");
    fireEvent.change(again, { target: { value: "2.5" } });
    await user.type(again, "{Enter}");
    expect(toast).toHaveBeenCalledWith("Enter the number of travellers as a whole number.", "error");
    expect(patchTrip()).toHaveLength(1);
  });

  it("says only the owner can change the trip's own facts when refused", async () => {
    handlers.push((c) => (c.method === "PATCH" ? { status: 403 } : undefined));
    const user = u();
    show();
    await user.click(within(tileFor("Travellers")).getByRole("button", { name: "Edit Travellers" }));
    const input = await screen.findByPlaceholderText("How many of you");
    await user.type(input, "{Enter}");
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Only the trip owner can change this.", "error"));
  });
});

