// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { JourneyRail, type RailLeg } from "../../features/conversation/ui/panels/JourneyRail";

afterEach(cleanup);

const legs: RailLeg[] = [
  { from: "YTZ", fromName: "Billy Bishop Toronto City Airport", to: "YUL", toName: "Montréal-Pierre Elliott Trudeau International Airport", airline: "Air Canada", flightNumber: "AC 7962", aircraft: "De Havilland Dash 8", minutes: 76, departAt: "2027-01-12T12:30:00", arriveAt: "2027-01-12T13:46:00", layoverMinutes: 174, legroom: "30 in" },
  { from: "YUL", fromName: "Montréal-Pierre Elliott Trudeau International Airport", to: "ZRH", toName: "Zurich Airport", airline: "SWISS", flightNumber: "LX 87", aircraft: "Airbus A330", minutes: 455, departAt: "2027-01-12T16:40:00", arriveAt: "2027-01-13T06:15:00", layoverMinutes: 405, legroom: "31 in", amenities: ["Wi-Fi for a fee", "In-seat USB outlet", "On-demand video"] },
  { from: "ZRH", fromName: "Zurich Airport", to: "DEL", toName: "Indira Gandhi International Airport", airline: "SWISS", flightNumber: "LX 2646", minutes: 465, departAt: "2027-01-13T13:00:00", arriveAt: "2027-01-14T01:15:00", oftenDelayed: true },
];

describe("JourneyRail", () => {
  it("draws one block per airport with arrival over departure at a connection, and flags only the risky wait", () => {
    render(<JourneyRail legs={legs} />);
    expect(screen.getByText("3 flights, 9h 39m of layover")).toBeTruthy();
    expect(screen.getByText("Billy Bishop Toronto City")).toBeTruthy();
    expect(screen.getByText("2h 54m layover")).toBeTruthy(); // an ordinary wait: a plain pill
    expect(screen.getByText("Long layover: 6h 45m")).toBeTruthy(); // 6h or more: a flag
    expect(screen.getByText("Often over 30 min late")).toBeTruthy();
    expect(screen.getByText(/\+2/)).toBeTruthy(); // lands two days after leaving
  });

  it("opens a flight's detail on click, in words, and closes it again", async () => {
    render(<JourneyRail legs={legs} />);
    const swiss = screen.getByRole("button", { name: /SWISS LX 87/ });
    expect(swiss.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Wi-Fi (paid)")).toBeNull();
    await userEvent.click(swiss);
    expect(swiss.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Airbus A330")).toBeTruthy();
    expect(screen.getByText("31 in")).toBeTruthy();
    expect(screen.getByText("Wi-Fi (paid)")).toBeTruthy();
    expect(screen.getByText("USB at your seat")).toBeTruthy();
    expect(screen.getByText("On-demand video")).toBeTruthy();
    await userEvent.click(swiss);
    expect(swiss.getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves out the dates when the pass above already gives them, and a flight with nothing to open is not a button", () => {
    const { container } = render(<JourneyRail legs={legs} showDates={false} />);
    expect(container.textContent).not.toMatch(/Jan 12|Jan 14/);
    expect(screen.queryByRole("button", { name: /LX 2646/ })).toBeNull(); // no aircraft, legroom or comforts: nothing to disclose
  });

  it("draws a saved card's airports without times or layovers, and does not invent either", () => {
    const bare: RailLeg[] = [{ from: "YYZ", to: "ZRH", flightNumber: "AC 878", departAt: "2027-01-12T20:25:00" }, { from: "ZRH", to: "DEL", flightNumber: "LX 146", arriveAt: "2027-01-14T01:15:00" }];
    const { container } = render(<JourneyRail legs={bare} />);
    expect(screen.getByText("2 flights")).toBeTruthy();
    expect(container.textContent).not.toMatch(/layover/i);
    expect(container.textContent).toContain("–"); // the unknown time at the connection
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
