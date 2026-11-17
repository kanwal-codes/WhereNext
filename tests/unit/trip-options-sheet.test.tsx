// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

let phone = true;
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => phone }));
vi.mock("@/components/DateTimeField", () => ({ DateField: () => <input aria-label="Day" />, TimeField: () => <input aria-label="Time" /> }));

import { TripOptionsSheet } from "../../features/transport/ui/TripOptions";

afterEach(cleanup);

const show = (props: Partial<React.ComponentProps<typeof TripOptionsSheet>> = {}) =>
  render(<TripOptionsSheet open onClose={vi.fn()} when={null} onWhen={vi.fn()} travellers={2} onTravellers={vi.fn()} returnDate="" onReturnDate={vi.fn()} showReturn={false} {...props} />);

describe("TripOptionsSheet", () => {
  it("is a dialog with when, who and a Done button that closes it", async () => {
    phone = true;
    const onClose = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    show({ onClose });
    const sheet = screen.getByRole("dialog", { name: "When and who" });
    expect(within(sheet).getByText("Travellers")).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers a return day only for flights, and nothing while closed", () => {
    phone = false;
    show({ showReturn: false });
    expect(screen.queryByText(/Return day/)).toBeNull();
    cleanup();
    show({ showReturn: true });
    expect(screen.getByText(/Return day/)).toBeTruthy();
    cleanup();
    show({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
