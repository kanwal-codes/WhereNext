// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/conversation/ui/blocks/RouteMap", () => ({ RouteMap: () => <div>MAP</div> }));
vi.mock("@/components/use-distance", () => ({ useDistance: () => (km: number) => `${km.toFixed(1)} km` }));

import { RouteComparisonCard } from "@/features/conversation/ui/blocks/RouteBlocks";

afterEach(cleanup);

const ride = (steps: string[], over: Record<string, unknown> = {}) => ({
  type: "route_summary" as const, from: "Montreal, Quebec, Canada", to: "Toronto, Ontario, Canada", mode: "transit", durationSeconds: 24_000, distanceMeters: 541_600,
  steps, retrievedAt: "t", ...over,
});
const routes = [
  ride(["TRANSIT Train VIA Rail → Toronto Union Station (5 h 9 min)"], { durationSeconds: 18_540 }),
  ride(["TRANSIT Bus Megabus → Toronto Coach Terminal (6 h 40 min)"], { durationSeconds: 24_000 }),
];

describe("a ride in the ways-to-get-there card", () => {
  it("opens its own detail when it is clicked, at that ride, and the map follows it", () => {
    const onOpenPanel = vi.fn();
    render(<RouteComparisonCard from="Montreal, Quebec, Canada" to="Toronto, Ontario, Canada" routes={routes} onOpenPanel={onOpenPanel} onFollowup={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Transit, 6 h 40 min: open the details/ }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    const panel = onOpenPanel.mock.calls[0][0];
    expect(panel.kind).toBe("route");
    expect(panel.routes[panel.active].steps[0]).toContain("Megabus");
  });

  it("draws a bus that ends at a terminal as a bus, not a plane", () => {
    const { container } = render(<RouteComparisonCard from="Montreal, Quebec, Canada" to="Toronto, Ontario, Canada" routes={routes} onOpenPanel={() => undefined} onFollowup={() => undefined} />);
    const rows = [...container.querySelectorAll("button")].filter((b) => /open the details/.test(b.getAttribute("aria-label") ?? ""));
    const icons = rows.map((row) => row.querySelector("svg")?.getAttribute("class") ?? "");
    expect(icons.some((c) => /lucide-plane/.test(c))).toBe(false);
    expect(icons.some((c) => /lucide-bus/.test(c))).toBe(true);
    expect(icons.some((c) => /lucide-train-front/.test(c))).toBe(true);
  });

  it("only shows it on the map when there is no panel to open", () => {
    render(<RouteComparisonCard from="Montreal, Quebec, Canada" to="Toronto, Ontario, Canada" routes={routes} onFollowup={() => undefined} />);
    expect(screen.getAllByRole("button", { name: /show on the map/ }).length).toBeGreaterThan(0);
  });
});
