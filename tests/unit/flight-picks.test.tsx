// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightPicks, offerKey, pickFares } from "../../features/conversation/ui/blocks/FlightWidget";

const offer = (over: Record<string, unknown> = {}) => ({ airline: "Ryanair", price: "47.20", currency: "USD", durationMinutes: 150, stops: 0, departAt: "2026-12-31T12:45:00", arriveAt: "2026-12-31T15:15:00", originAirport: "BVA", destinationAirport: "ARN", ...over });
const phone = (matches: boolean) => Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches }) });

// FitText measures its line with a ResizeObserver, which jsdom does not have.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

afterEach(cleanup);

describe("FlightPicks: one fare that is both the cheapest and the fastest", () => {
  const items = [offer(), offer({ airline: "Transavia", price: "69", durationMinutes: 165, departAt: "2026-12-31T16:25:00", arriveAt: "2026-12-31T19:10:00" })];

  it("merges into one pick that carries both labels", () => {
    const picks = pickFares(items as never);
    expect(picks).toHaveLength(1);
    expect(picks[0].labels).toEqual(["Cheapest", "Fastest"]);
  });

  it("draws one card: both labels, the airline, the price per person, and the same times and airports the rows show", () => {
    render(<FlightPicks picks={pickFares(items as never)} selected={null} onSelect={() => {}} />);
    const card = screen.getByRole("button", { pressed: false });
    expect(card.textContent).toContain("Cheapest");
    expect(card.textContent).toContain("Fastest");
    expect(card.textContent).toContain("Ryanair");
    expect(card.textContent).toContain("$47");
    expect(card.textContent).toContain("per person");
    expect(card.textContent).toContain("12:45 PM");
    expect(card.textContent).toContain("3:15 PM");
    expect(card.textContent).toContain("2h 30m · nonstop");
    expect(card.textContent).toContain("BVA");
    expect(card.textContent).toContain("ARN");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows a stop on the line and names a long layover in one quiet line; an ordinary layover says nothing", () => {
    const leg = (over: Record<string, unknown>) => ({ from: "YYZ", departAt: "2026-12-20T07:10:00", to: "YYC", arriveAt: "2026-12-20T09:15:00", minutes: 245, ...over });
    const connecting = (layoverMinutes: number) => offer({ airline: "WestJet", price: "312", stops: 1, durationMinutes: 745, layoverAirports: ["YYC"], originAirport: "YYZ", destinationAirport: "YVR", legs: [leg({ layoverMinutes }), leg({ from: "YYC", to: "YVR", minutes: 80 })] });
    const slower = offer({ airline: "Flair", price: "340", stops: 2, durationMinutes: 780 });
    render(<FlightPicks picks={pickFares([connecting(420), slower] as never)} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("button").textContent).toContain("1 stop");
    expect(screen.getByRole("button").textContent).toContain("via YYC");
    expect(screen.getByRole("button").textContent).toContain("Long layover: 7h");
    cleanup();
    render(<FlightPicks picks={pickFares([connecting(150), slower] as never)} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("button").textContent).toContain("via YYC");
    expect(screen.getByRole("button").textContent).not.toMatch(/layover|connection/i);
  });

  it("selects the fare, and on a phone also opens its sheet", () => {
    const [pick] = pickFares(items as never);
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    phone(true);
    render(<FlightPicks picks={[pick]} selected={null} onSelect={onSelect} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(offerKey(pick.offer));
    expect(onOpen).toHaveBeenCalledWith(pick.offer);
  });

  it("only selects on a wide screen, where the journey sits beside it", () => {
    const [pick] = pickFares(items as never);
    const onOpen = vi.fn();
    phone(false);
    render(<FlightPicks picks={[pick]} selected={offerKey(pick.offer)} onSelect={() => {}} onOpen={onOpen} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("leaves a lone fare as 'The only option', and two different winners as two tiles", () => {
    render(<FlightPicks picks={pickFares([offer()] as never)} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("The only option")).toBeTruthy();
    cleanup();
    const two = [offer({ price: "47" }), offer({ airline: "Air Test", price: "90", durationMinutes: 100 })];
    render(<FlightPicks picks={pickFares(two as never)} selected={null} onSelect={() => {}} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });
});
