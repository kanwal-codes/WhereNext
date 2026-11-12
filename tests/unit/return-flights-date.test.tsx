// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/conversation/ui/panels/OtherFlights", () => ({ FareCard: ({ offer }: { offer: { airline: string } }) => <div>FARE {offer.airline}</div> }));
vi.mock("@/features/conversation/ui/panels/OtherFlights.tsx", () => ({ FareCard: ({ offer }: { offer: { airline: string } }) => <div>FARE {offer.airline}</div> }));

import { ReturnFlights } from "../../features/conversation/ui/panels/ReturnFlights";

const outbound = { id: "o1", airline: "Porter", departAt: "2026-12-24T11:00", departureToken: "T1" } as never;
const back = (airline: string) => ({ id: `b-${airline}`, airline, price: "385", currency: "CAD" });
const makeRoute = (over: Record<string, unknown> = {}) => ({ origin: "Montreal", destination: "Toronto", dateNote: "", retrievedAt: "t", originId: "YUL", destinationId: "YYZ", departureDate: "2026-12-24", returnDate: "2026-12-31", ...over }) as never;

let calls: Array<{ url: string; body: Record<string, unknown> }>;
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/flights/return")) return new Response(JSON.stringify({ items: [back(body.departureToken === "T2" ? "WestJet" : "Air Canada")] }), { status: 200 });
    // a new search for the new return day: the same outbound flight is in it, with a token for that day
    return new Response(JSON.stringify({ items: [{ id: "o1", airline: "Porter", departAt: "2026-12-24T11:00", departureToken: "T2" }] }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the return day in the flight panel", () => {
  it("shows the return day as something to change, not just a label", async () => {
    render(<ReturnFlights tripId="t1" flight={outbound} route={makeRoute()} />);
    const input = await screen.findByLabelText("Return date");
    expect((input as HTMLInputElement).value).toBe("2026-12-31");
    expect((input as HTMLInputElement).min).toBe("2026-12-25"); // never before the day after departure
  });

  it("searches the new day, finds the same outbound flight in it, and asks for its flights back with the new token", async () => {
    const onChangeReturn = vi.fn();
    render(<ReturnFlights tripId="t1" flight={outbound} route={makeRoute({ onChangeReturn })} />);
    await screen.findByText("FARE Air Canada");
    fireEvent.change(screen.getByLabelText("Return date"), { target: { value: "2027-01-03" } });
    await waitFor(() => expect(screen.getByText("FARE WestJet")).toBeTruthy());
    expect(onChangeReturn).toHaveBeenCalledWith("2027-01-03"); // the card above follows
    const search = calls.find((c) => c.url.endsWith("/flights") && c.body.returnDate === "2027-01-03");
    expect(search?.body).toMatchObject({ departureDate: "2026-12-24", fromId: "YUL", toId: "YYZ" });
    const last = calls.filter((c) => c.url.endsWith("/flights/return")).at(-1)!;
    expect(last.body).toMatchObject({ returnDate: "2027-01-03", departureToken: "T2" });
    // no request ever paired the new day with the old token
    expect(calls.some((c) => c.url.endsWith("/flights/return") && c.body.returnDate === "2027-01-03" && c.body.departureToken === "T1")).toBe(false);
  });

  it("says so, instead of loading forever, when that outbound flight is not offered with the new day", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => (url.endsWith("/flights/return") ? new Response(JSON.stringify({ items: [back("Air Canada")] }), { status: 200 }) : new Response(JSON.stringify({ items: [] }), { status: 200 })));
    render(<ReturnFlights tripId="t1" flight={outbound} route={makeRoute()} />);
    await screen.findByText("FARE Air Canada");
    fireEvent.change(screen.getByLabelText("Return date"), { target: { value: "2027-01-03" } });
    expect(await screen.findByText(/isn’t offered with this return day/)).toBeTruthy();
  });
});
