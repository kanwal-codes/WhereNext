// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/trips/t1/discover";
vi.mock("next/navigation", () => ({ useParams: () => ({ tripId: "t1" }), usePathname: () => pathname }));
vi.mock("@/features/roam/ui/RoamMark", () => ({ RoamMark: () => <span data-testid="mark" /> }));

import { SectionError } from "../../components/SectionError";

afterEach(cleanup);

describe("SectionError", () => {
  it("says what happened, offers another try and a way back to the overview, and gives a reference", async () => {
    const reset = vi.fn();
    render(<SectionError what="this page" digest="abc123" reset={reset} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "We couldn’t show this page" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to overview" }).getAttribute("href")).toBe("/trips/t1");
    expect(screen.getByText("Reference abc123")).toBeTruthy();
  });

  it("sends you to all trips when the overview itself is what broke, and shows no reference without one", () => {
    pathname = "/trips/t1";
    render(<SectionError what="this page" reset={() => {}} />);
    expect(screen.getByRole("link", { name: "All trips" }).getAttribute("href")).toBe("/trips");
    expect(screen.queryByText(/Reference/)).toBeNull();
    pathname = "/trips/t1/discover";
  });
});
