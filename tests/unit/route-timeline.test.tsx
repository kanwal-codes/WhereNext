// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteDay } from "../../packages/contracts/route-plan";

vi.mock("@/components/use-distance", () => ({ useDistance: () => (km: number) => `${km.toFixed(1)} km` }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { RouteTimeline } from "../../features/maps/ui/RouteTimeline";

afterEach(cleanup);

const stops = [{ id: "a", name: "Hôtel Place d’Armes", lat: 1, lng: 1, time: "15:00" }, { id: "b", name: "Bistro Saint-Paul", lat: 2, lng: 2, time: "19:30" }];
const leg = (over: Partial<RouteDay["legs"][number]> = {}): RouteDay["legs"][number] => ({
  fromId: "a", fromName: "A", toId: "b", toName: "B", kind: "local", mode: "bus", minutes: 25, km: 3, fare: null, departure: null, arrival: null, polyline: [], note: null, timeFit: null,
  steps: [{ mode: "walk", minutes: 3 }, { mode: "bus", minutes: 18, line: "7", headsign: "Centre" }, { mode: "walk", minutes: 4 }],
  alternatives: [{ mode: "walk", minutes: 41, km: 3, fare: null }, { mode: "walk", minutes: 38, km: 3, fare: null }, { mode: "drive", minutes: 9, km: 3, fare: null }],
  ...over,
});
const day = (over: Partial<RouteDay> = {}): RouteDay => ({ day: 1, stops, legs: [leg()], summary: { movingMinutes: 25, transitRides: 1, fare: null }, ...over });

describe("RouteTimeline", () => {
  it("opens the pieces of a leg in a bottom sheet, with a way to open it in Maps, instead of unfolding it", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { container } = render(<RouteTimeline day={day()} tripId="t1" />);
    // The multi-mode bar is there when the day mixes ways of travelling.
    expect(container.querySelector('div[aria-hidden="true"][class*="3px"]')).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: /25 min/ }));
    const sheet = await screen.findByRole("dialog", { name: "Getting between two stops" });
    expect(within(sheet).getByText(/toward Centre/)).toBeTruthy();
    expect(within(sheet).getByRole("link", { name: /Open in Maps/ }).getAttribute("href")).toContain("origin=H%C3%B4tel%20Place%20d%E2%80%99Armes&destination=Bistro%20Saint-Paul&travelmode=transit");
  });

  it("keeps the ride's clock times out of the row and in the sheet", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RouteTimeline day={day({ legs: [leg({ departure: "2026-11-27T12:34:00", arrival: "2026-11-27T12:53:00" })] })} tripId="t1" />);
    const row = screen.getByRole("button", { name: /25 min/ });
    expect(row.textContent).not.toMatch(/12:34/);
    await user.click(row);
    expect(within(await screen.findByRole("dialog", { name: "Getting between two stops" })).getByText(/12:34.*12:53/)).toBeTruthy();
  });

  it("offers one chip for each other way of travelling", () => {
    render(<RouteTimeline day={day()} tripId="t1" />);
    expect(screen.getAllByRole("button", { name: /Go by walk instead/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Go by drive instead/i })).toHaveLength(1);
  });

  it("shows what is booked like the Plan page does, and drops the bar of modes when the day is one short walk", () => {
    const walk = leg({ mode: "walk", steps: [{ mode: "walk", minutes: 8 }], alternatives: [] });
    const { container } = render(<RouteTimeline day={day({ legs: [walk], booked: [{ kind: "hotel", title: "Hôtel Place d’Armes", detail: null }] })} tripId="t1" />);
    expect(screen.getByRole("list", { name: "Booked" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Hôtel Place d’Armes/ }).getAttribute("href")).toBe("/trips/t1/bookings");
    expect(container.querySelector('div[aria-hidden="true"][class*="3px"]')).toBeNull();
    // A lone walk has nothing more to open.
    expect(screen.getByRole("button", { name: /25 min/ }).getAttribute("aria-haspopup")).toBeNull();
  });

  it("shows a day with one stop, and where to find another", () => {
    render(<RouteTimeline day={day({ stops: [stops[0]], legs: [] })} tripId="t1" />);
    expect(screen.getByText("Hôtel Place d’Armes")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find places to add" }).getAttribute("href")).toBe("/trips/t1/discover");
  });
});
