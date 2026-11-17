// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelBoundary } from "../../components/PanelBoundary";

afterEach(cleanup);

let broken = true;
function Piece() {
  if (broken) throw new Error("boom");
  return <p>the panel</p>;
}

describe("PanelBoundary", () => {
  it("keeps a crash inside the panel: it says so, can try again, and can be closed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    broken = true;
    const onClose = vi.fn();
    render(<PanelBoundary resetKey="a" onClose={onClose}><Piece /></PanelBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("We couldn’t load this");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByText("the panel")).toBeTruthy();
  });

  it("clears when something else is opened in it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    broken = true;
    const { rerender } = render(<PanelBoundary resetKey="a"><Piece /></PanelBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    broken = false;
    rerender(<PanelBoundary resetKey="b"><Piece /></PanelBoundary>);
    expect(screen.getByText("the panel")).toBeTruthy();
  });
});
