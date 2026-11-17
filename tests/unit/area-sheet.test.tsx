// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBroadPlace, splitDestinations } from "../../lib/trip-stops";
import { popularAreasFor } from "../../lib/popular-areas";
import { useTripCity } from "../../lib/client/use-trip-city";
import { AreaSheet } from "../../components/AreaSheet";

vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => true }));

beforeEach(() => {
  try { window.sessionStorage.clear(); } catch { /* */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("a destination written as several places", () => {
  it("keeps every country of a multi-country trip, and still drops a country that is only the address", () => {
    expect(splitDestinations("Portugal, Spain")).toEqual(["Portugal", "Spain"]);
    expect(splitDestinations("France, Italy, Spain")).toEqual(["France", "Italy", "Spain"]);
    expect(splitDestinations("Lisbon, Portugal")).toEqual(["Lisbon"]);
    expect(splitDestinations("Rome, Paris, France")).toEqual(["Rome", "Paris"]);
    expect(splitDestinations("Niagara Falls, Ontario, Canada")).toEqual(["Niagara Falls"]);
    expect(splitDestinations("Atlanta, Georgia, USA")).toEqual(["Atlanta"]);
  });
});

describe("which places are too big to search as one", () => {
  it("knows countries, states, provinces, famous regions and a trip with no place yet", () => {
    for (const name of ["Portugal", "India", "Kerala", "Ontario", "Tuscany", "Somewhere in Europe (country not chosen yet)", "USA"]) expect(isBroadPlace(name), name).toBe(true);
    for (const name of ["Lisbon", "Porto", "Toronto", "Ibiza", "", null]) expect(isBroadPlace(name as string), String(name)).toBe(false);
  });

  it("lists the usual places inside the big ones, and none for a city", () => {
    expect(popularAreasFor("Portugal")).toContain("Porto");
    expect(popularAreasFor("india")).toContain("Jaipur");
    expect(popularAreasFor("Kerala")).toContain("Munnar");
    expect(popularAreasFor("Lisbon")).toEqual([]);
  });
});

describe("useTripCity: narrowing a broad destination", () => {
  const trip = { id: "t1", destination: "Portugal", start_date: null, end_date: null, stops: null };

  it("searches the narrowed place instead of the country, and goes back with null", () => {
    const { result } = renderHook(() => useTripCity(trip));
    expect(result.current.broad).toBe(true);
    expect(result.current.scoped).toBe(false);
    expect(result.current.city).toBe("Portugal");
    act(() => result.current.setArea({ name: "Porto", text: "Porto, Portugal" }));
    expect(result.current.scoped).toBe(true);
    expect(result.current.city).toBe("Porto, Portugal");
    expect(result.current.area?.name).toBe("Porto");
    act(() => result.current.setArea(null));
    expect(result.current.scoped).toBe(false);
    expect(result.current.city).toBe("Portugal");
  });

  it("keeps the choice for the visit, and drops it when another stop is picked", () => {
    const multi = { id: "t2", destination: "Portugal, Spain", start_date: null, end_date: null, stops: [{ city: "Portugal" }, { city: "Spain" }] };
    const first = renderHook(() => useTripCity(multi));
    act(() => first.result.current.setArea({ name: "Porto", text: "Porto, Portugal" }));
    first.unmount();
    const again = renderHook(() => useTripCity(multi));
    expect(again.result.current.area?.name).toBe("Porto");
    act(() => again.result.current.setCity("Spain"));
    expect(again.result.current.area).toBeNull();
    expect(again.result.current.city).toBe("Spain");
  });

  it("hands out the same area object until it changes, so nothing built from it re-renders in a loop", () => {
    const { result, rerender } = renderHook(() => useTripCity(trip));
    act(() => result.current.setArea({ name: "Porto", text: "Porto, Portugal" }));
    const first = result.current.area;
    rerender();
    rerender();
    expect(result.current.area).toBe(first);
  });

  it("does not offer to narrow a city-sized destination", () => {
    const { result } = renderHook(() => useTripCity({ ...trip, id: "t3", destination: "Lisbon" }));
    expect(result.current.broad).toBe(false);
  });
});

describe("AreaSheet", () => {
  const props = { open: true, onClose: vi.fn(), tripId: "t1", parent: "Portugal", stops: [{ city: "Portugal", startDate: null, endDate: null }], activeStop: "Portugal", area: null, onPickStop: vi.fn(), narrow: true };
  const suggestion = (placeId: string, text: string, secondaryText: string, fullText: string) => ({ placeId, text, secondaryText, fullText, types: ["locality"] });

  it("starts with the usual places and 'Anywhere', and picking one narrows to it and closes", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onPickArea = vi.fn(); const onClose = vi.fn();
    render(<AreaSheet {...props} onPickArea={onPickArea} onClose={onClose} />);
    const sheet = screen.getByRole("dialog", { name: "Where in Portugal" });
    expect(within(sheet).getByRole("button", { name: /Anywhere in Portugal/ }).getAttribute("aria-current")).toBe("true");
    await user.click(within(sheet).getByRole("button", { name: /^Porto/ }));
    expect(onPickArea).toHaveBeenCalledWith({ name: "Porto", text: "Porto, Portugal" });
    expect(onClose).toHaveBeenCalled();
  });

  it("goes back to the whole place from 'Anywhere'", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onPickArea = vi.fn();
    render(<AreaSheet {...props} area={{ name: "Porto", text: "Porto, Portugal" }} onPickArea={onPickArea} />);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /^Porto/ }).getAttribute("aria-current")).toBe("true");
    await user.click(within(sheet).getByRole("button", { name: /Anywhere in Portugal/ }));
    expect(onPickArea).toHaveBeenCalledWith(null);
  });

  it("searches inside the place and drops results from anywhere else", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(decodeURIComponent(String(url)));
      return new Response(JSON.stringify({ suggestions: [suggestion("1", "Portimão", "Faro, Portugal", "Portimão, Faro, Portugal"), suggestion("2", "Port Elizabeth", "South Africa", "Port Elizabeth, South Africa")] }), { status: 200 });
    }));
    const onPickArea = vi.fn();
    render(<AreaSheet {...props} onPickArea={onPickArea} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Search in Portugal/ }), { target: { value: "Port" } });
    await screen.findByRole("button", { name: /Portimão/ });
    expect(calls.at(-1)).toContain("query=Port, Portugal");
    expect(screen.queryByRole("button", { name: /Port Elizabeth/ })).toBeNull();
    // 'Anywhere' belongs to the empty search, not to a list of matches.
    expect(screen.queryByRole("button", { name: /Anywhere in Portugal/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Portimão/ }));
    expect(onPickArea).toHaveBeenCalledWith({ name: "Portimão", text: "Portimão, Faro, Portugal" });
  });

  it("still takes a name nothing matched, as typed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ suggestions: [] }), { status: 200 })));
    const onPickArea = vi.fn();
    render(<AreaSheet {...props} onPickArea={onPickArea} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Search in Portugal/ }), { target: { value: "Quinta do Lago" } });
    await user.click(await screen.findByRole("button", { name: /Use “Quinta do Lago”/ }));
    expect(onPickArea).toHaveBeenCalledWith({ name: "Quinta do Lago", text: "Quinta do Lago, Portugal" });
  });

  it("lists the stops of a multi-city trip above the narrowing, and picking a stop is not a narrowing", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onPickStop = vi.fn(); const onPickArea = vi.fn();
    render(<AreaSheet {...props} stops={[{ city: "Portugal", startDate: "2026-12-01", endDate: "2026-12-05" }, { city: "Rome", startDate: "2026-12-05", endDate: "2026-12-08" }]} onPickStop={onPickStop} onPickArea={onPickArea} />);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Where in the trip?")).toBeTruthy();
    // The stops are one strip with the current one pressed, and the places under it are that stop's.
    const strip = within(sheet).getByRole("group", { name: "Trip stops" });
    expect(within(strip).getByRole("button", { name: /Portugal/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(strip).getByRole("button", { name: /Rome/ }).getAttribute("aria-pressed")).toBe("false");
    expect(within(sheet).getByRole("textbox", { name: "Search in Portugal" })).toBeTruthy();
    await user.click(within(sheet).getByRole("button", { name: /Rome/ }));
    expect(onPickStop).toHaveBeenCalledWith("Rome");
    expect(onPickArea).not.toHaveBeenCalled();
  });

  it("stays open after picking a country, so its cities are next, and closes after picking a city", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onClose = vi.fn(); const onPickStop = vi.fn();
    const stops = [{ city: "Portugal", startDate: null, endDate: null }, { city: "Spain", startDate: null, endDate: null }, { city: "Rome", startDate: null, endDate: null }];
    render(<AreaSheet {...props} onClose={onClose} onPickStop={onPickStop} stops={stops} onPickArea={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Spain/ }));
    expect(onPickStop).toHaveBeenCalledWith("Spain");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Rome/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks the narrowed place as the chosen row under the current country", () => {
    render(<AreaSheet {...props} area={{ name: "Porto", text: "Porto, Portugal" }} stops={[{ city: "Portugal", startDate: null, endDate: null }, { city: "Spain", startDate: null, endDate: null }]} onPickArea={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Portugal/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Porto$/ }).getAttribute("aria-current")).toBe("true");
  });

  it("is only the list of stops when the place is already a city", () => {
    render(<AreaSheet {...props} parent="Lisbon" narrow={false} stops={[{ city: "Lisbon", startDate: null, endDate: null }, { city: "Porto", startDate: null, endDate: null }]} onPickArea={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Porto/ })).toBeTruthy();
  });
});
