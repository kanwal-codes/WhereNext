// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/application/toast", () => ({ notifyToast: vi.fn() }));
vi.mock("@/lib/use-speech-input", () => ({ useSpeechInput: () => ({ supported: false, listening: false, toggle: vi.fn(), stop: vi.fn() }) }));
vi.mock("@/components/DestinationCombobox", () => ({
  DestinationCombobox: ({ ariaLabel, value, onChange, onSelect, onEnter, placeholder, inputRef }: { ariaLabel: string; value: string; onChange: (v: string) => void; onSelect: (v: string) => void; onEnter?: () => void; placeholder?: string; inputRef?: React.Ref<HTMLInputElement> }) => (
    <div>
      <input ref={inputRef} aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }} />
      <button type="button" onClick={() => onSelect(value)}>{`pick ${ariaLabel}`}</button>
    </div>
  ),
}));

import { RouteEditor } from "../../features/transport/ui/RouteEditor";
import { useRouteAsk } from "../../features/transport/application/useRouteAsk";

/** The editor with a small stand-in for the search: what it is asked to search for is what the tests look at. */
function Editor({ search, onGo = () => {}, home = "Toronto, Canada", stay = "" }: { search: ReturnType<typeof vi.fn>; onGo?: () => void; home?: string; stay?: string }) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const t = { from, to, setFrom, setTo, search, setAnyTime: vi.fn(), when: null, trip: null } as never;
  const ask = useRouteAsk({ tripId: "t1", t, home, stay, onGo });
  const ref = React.useRef<HTMLInputElement>(null);
  const ref2 = React.useRef<HTMLInputElement>(null);
  return <RouteEditor tripId="t1" t={t} ask={ask} chips={{ home, stay, destination: "Montreal" }} onClose={() => {}} toRef={ref} fromRef={ref2} />;
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("RouteEditor", () => {
  beforeEach(() => cleanup());

  it("asks only where to, then where from, and searches when it has both", async () => {
    const search = vi.fn();
    const onGo = vi.fn();
    const u = user();
    render(<Editor search={search} onGo={onGo} />);
    expect(screen.queryByLabelText("From")).toBeNull();
    await u.type(screen.getByLabelText("To"), "Lisbon");
    await u.click(screen.getByText("pick To"));
    // A destination and no start: the start is asked, with the trip's usual places as one-tap answers.
    expect(await screen.findByText("Where are you leaving from?")).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Toronto" }));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ from: "Toronto, Canada", to: "Lisbon" }));
    expect(onGo).toHaveBeenCalled();
  });

  it("reads a whole sentence typed in the To field, with the days and the way of travelling", async () => {
    const search = vi.fn();
    const u = user();
    render(<Editor search={search} />);
    await u.type(screen.getByLabelText("To"), "flights from toronto to montreal dec 1-14 for 2{Enter}");
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ from: "Toronto", to: "Montreal", modes: ["flight"], travellers: 2, returnDate: expect.stringMatching(/-12-14$/) }));
  });

  it("asks which city when the destination is a country, and searches on the answer", async () => {
    const search = vi.fn();
    const u = user();
    render(<Editor search={search} />);
    await u.type(screen.getByLabelText("To"), "montreal to portugal{Enter}");
    expect(await screen.findByText("Which city in Portugal?")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ from: "Montreal", to: "Lisbon" }));
  });

  it("offers the locked hotel as a way to leave from", async () => {
    const search = vi.fn();
    const u = user();
    render(<Editor search={search} stay="Hôtel Place d'Armes" />);
    await u.type(screen.getByLabelText("To"), "Old Port");
    await u.click(screen.getByText("pick To"));
    await u.click(await screen.findByRole("button", { name: "My hotel" }));
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ from: "Hôtel Place d'Armes", to: "Old Port" }));
  });

  it("will not search from a place to itself", async () => {
    const search = vi.fn();
    const u = user();
    render(<Editor search={search} />);
    await u.type(screen.getByLabelText("To"), "paris to paris{Enter}");
    expect(search).not.toHaveBeenCalled();
    expect(await screen.findByText(/twice/)).toBeTruthy();
  });
});
