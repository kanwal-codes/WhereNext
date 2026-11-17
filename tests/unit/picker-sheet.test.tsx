// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PickerSheet } from "../../components/PickerSheet";
import { Sheet } from "../../components/motion/Sheet";
import { sheetPrimary } from "../../components/motion/sheetActions";

afterEach(cleanup);

describe("PickerSheet", () => {
  const options = [{ key: "a", label: "Fastest", sub: "Shortest time first" }, { key: "b", label: "Cheapest" }];

  it("marks the chosen row with a grey fill, and closes when another is picked", async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<PickerSheet open onClose={onClose} title="Sort by" ariaLabel="Sort results" options={options} value="a" onPick={onPick} />);
    const sheet = screen.getByRole("dialog", { name: "Sort results" });
    const chosen = within(sheet).getByRole("button", { name: /Fastest/ });
    expect(chosen.getAttribute("aria-current")).toBe("true");
    expect(chosen.className.split(" ")).toContain("bg-muted");
    expect(within(sheet).getByRole("button", { name: "Cheapest" }).className.split(" ")).not.toContain("bg-muted");
    await user.click(within(sheet).getByRole("button", { name: "Cheapest" }));
    expect(onPick).toHaveBeenCalledWith("b");
    expect(onClose).toHaveBeenCalled();
  });

  it("uses taller rows when a row has a detail line", () => {
    render(<PickerSheet open onClose={() => {}} title="Sort by" ariaLabel="Sort results" options={options} value="b" onPick={() => {}} />);
    expect(screen.getByRole("button", { name: /Fastest/ }).className).toContain("min-h-16");
    expect(screen.getByRole("button", { name: "Cheapest" }).className).toContain("min-h-14");
  });
});

describe("Sheet footer", () => {
  it("keeps the footer under the body, with the shared primary button", () => {
    render(<Sheet open onClose={() => {}} ariaLabel="Demo" footer={<button type="button" className={sheetPrimary}>Done</button>}><p>Body</p></Sheet>);
    const sheet = screen.getByRole("dialog", { name: "Demo" });
    expect(sheet.className).toContain("rounded-t-4xl");
    const done = within(sheet).getByRole("button", { name: "Done" });
    expect(done.className).toContain("h-12");
    expect(sheet.textContent?.indexOf("Body")).toBeLessThan(sheet.textContent?.indexOf("Done") ?? 0);
  });
});
