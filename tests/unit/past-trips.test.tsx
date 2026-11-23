// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

type Any = Record<string, any>;
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }: Any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/trips/TripCover", () => ({ TripCover: () => <i data-testid="cover" /> }));
vi.mock("@/components/trips/TripMenu", () => ({ TripMenu: ({ name, onDelete }: Any) => <button type="button" onClick={onDelete}>{`menu ${name}`}</button> }));

import { PastTrips } from "../../components/trips/PastTrips";

const trip = (id: string, name: string, over: Any = {}) => ({ id, name, destination: null, origin: null, duration_days: null, start_date: "2026-10-27", end_date: "2026-10-29", travelers: 2, ...over });

afterEach(cleanup);

describe("PastTrips", () => {
  it("is one folded row until it is opened, and says how many trips are in it", async () => {
    render(<PastTrips trips={[trip("a", "Niagara Falls trip"), trip("b", "Montreal trip", { travelers: null })] as never} deleting={null} onDelete={() => undefined} />);
    const toggle = screen.getByRole("button", { name: /Past trips/ });
    expect(toggle.textContent).toContain("2");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.setup({ pointerEventsCheck: 0 }).click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /Niagara Falls trip/ }).getAttribute("href")).toBe("/trips/a");
    // When and how many are said under the name; with neither, nothing is.
    expect(screen.getByRole("link", { name: /Niagara Falls trip/ }).textContent).toContain("2 travellers");
  });

  it("opens by itself when it is all there is, and shows nothing with no past trips", () => {
    render(<PastTrips trips={[trip("a", "Rome")] as never} deleting={null} onDelete={() => undefined} defaultOpen />);
    expect(screen.getByRole("button", { name: /Past trips/ }).getAttribute("aria-expanded")).toBe("true");
    cleanup();
    const { container } = render(<PastTrips trips={[]} deleting={null} onDelete={() => undefined} />);
    expect(container.textContent).toBe("");
  });

  it("hands a trip to the delete sheet from its menu", async () => {
    const onDelete = vi.fn();
    render(<PastTrips trips={[trip("a", "Rome")] as never} deleting={null} onDelete={onDelete} defaultOpen />);
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole("button", { name: "menu Rome" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
});
