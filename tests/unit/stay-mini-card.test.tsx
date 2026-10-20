// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The stay card inside Discover: where it goes when opened, and what it adds to a comparison. The cards themselves are faked. */
type Any = Record<string, any>;
const push = vi.fn();
let panel: Any | null;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => panel }));
vi.mock("@/features/stays/ui/StayResultCard", () => ({ StayResultCard: (p: Any) => <div data-testid="result" data-href={p.href} data-comparing={String(p.comparing)} data-selected={String(p.selected)}><button type="button" onClick={p.onOpen}>open</button></div> }));
vi.mock("@/features/places/ui/DiscoverTile", () => ({ DiscoverTile: (p: Any) => <div data-testid="tile" data-feature={String(p.feature)}><button type="button" onClick={p.onOpen}>{p.label}</button><span>{p.title}</span><span data-testid="meta">{p.meta}</span>{p.overlay}</div> }));
vi.mock("@/features/conversation/ui/blocks/ui", () => ({ CompareMark: ({ selected }: Any) => <span data-testid="mark">{String(selected)}</span> }));

import { StayMiniCard } from "../../features/places/ui/StayMiniCard";

const TRIP = "11111111-1111-4111-8111-111111111111";
const stay = (over: Any = {}) => ({ hotelId: "h/1", name: "Hotel Lutetia", thumbnail: "https://img/h.jpg", nightlyAmount: 230.4, currency: "EUR", stars: 4, rating: 8.7, ...over });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => { panel = null; push.mockClear(); });
afterEach(cleanup);

describe("StayMiniCard", () => {
  it("opens the hotel's page when there is no side panel", async () => {
    render(<StayMiniCard tripId={TRIP} stay={stay() as never} />);
    expect(screen.getByTestId("result").dataset.href).toBe(`/trips/${TRIP}/stay/h%2F1`);
    await u().click(screen.getByRole("button", { name: "open" }));
    expect(push).toHaveBeenCalledWith(`/trips/${TRIP}/stay/h%2F1`);
  });

  it("opens the hotel in the side panel when there is one", async () => {
    panel = { openPanel: vi.fn(), compareMode: false, compareToggle: vi.fn(), compareHas: () => false };
    render(<StayMiniCard tripId={TRIP} stay={stay() as never} />);
    await u().click(screen.getByRole("button", { name: "open" }));
    expect(panel.openPanel).toHaveBeenCalledWith({ kind: "stay", hotelId: "h/1", name: "Hotel Lutetia" });
    expect(push).not.toHaveBeenCalled();
  });

  it("adds the hotel to the comparison while comparing, with its price and score", async () => {
    panel = { openPanel: vi.fn(), compareMode: true, compareToggle: vi.fn(), compareHas: (id: string) => id === "h/1" };
    render(<StayMiniCard tripId={TRIP} stay={stay() as never} />);
    expect(screen.getByTestId("result").dataset.comparing).toBe("true");
    expect(screen.getByTestId("result").dataset.selected).toBe("true");
    await u().click(screen.getByRole("button", { name: "open" }));
    expect(panel.compareToggle).toHaveBeenCalledWith({
      id: "h/1", kind: "stay", name: "Hotel Lutetia", href: `/trips/${TRIP}/stay/h%2F1`, image: "https://img/h.jpg",
      attrs: { price: "230 EUR/night", priceValue: 230.4, rating: "8.7/10", ratingValue: 8.7, detail: "Stay" },
    });
    expect(panel.openPanel).not.toHaveBeenCalled();
  });

  it("leaves out an unrated hotel's score and an unpriced hotel's price on the phone tile", () => {
    render(<StayMiniCard tripId={TRIP} stay={stay({ rating: null, nightlyAmount: 0 }) as never} phoneTile="grid" />);
    expect(screen.getByTestId("meta").textContent).toBe("Stay");
  });

  it("is a tile on the phone, with the price per night and the comparison mark", () => {
    panel = { openPanel: vi.fn(), compareMode: true, compareToggle: vi.fn(), compareHas: () => false };
    render(<StayMiniCard tripId={TRIP} stay={stay() as never} phoneTile="feature" />);
    expect(screen.getByTestId("tile").dataset.feature).toBe("true");
    expect(screen.getByTestId("meta").textContent).toMatch(/230.*\/ night/);
    expect(screen.getByTestId("mark").textContent).toBe("false");
    expect(screen.getByRole("button", { name: "Open Hotel Lutetia" })).toBeTruthy();
  });
});
