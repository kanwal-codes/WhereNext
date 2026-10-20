// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the trip map. Mapbox is replaced by a recorder (tests/support/fake-mapbox.ts), so what is checked is
 * what the component asks the map to do: the pins, how the view is framed, the lines, the overlay and the theme swap.
 */
vi.mock("mapbox-gl", async () => (await import("../support/fake-mapbox")).fakeMapboxModule());
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

import { TripMap, type MapPin } from "../../components/TripMap";
import { mapbox, type FakeMap } from "../support/fake-mapbox";

let rafQueue: Array<(t: number) => void>;
let tokenOk = true;
const pin = (id: string, name: string, lng: number, lat: number, over: Partial<MapPin> = {}): MapPin => ({ id, name, lng, lat, kind: "see", ...over });
const A = pin("a", "Louvre", 2.34, 48.86, { day: 1, href: "/p/a" });
const B = pin("b", "Eiffel", 2.29, 48.85, { day: 1 });
const C = pin("c", "Versailles", 2.12, 48.8, { day: 2 });
const S = pin("s", "Hotel", 2.3, 48.84, { kind: "stay" });
const E = pin("e", "Cafe", 2.31, 48.83, { kind: "eat" });
const leg = (mode: string, pts: Array<[number, number]>, over: Record<string, unknown> = {}) => ({ mode, polyline: pts, ...over });
const L1 = leg("walk", [[2.34, 48.86], [2.3, 48.85]]);

async function boot(props: Partial<React.ComponentProps<typeof TripMap>> = {}) {
  const view = render(<TripMap pins={[]} activeDay="all" {...props} />);
  await waitFor(() => expect(mapbox.maps).toHaveLength(1));
  const m = mapbox.maps[0];
  act(() => { m.fire("style.load"); m.fire("load"); });
  await waitFor(() => expect(screen.queryByText("Loading map…")).toBeNull());
  return { m, ...view, rerenderWith: (p: Partial<React.ComponentProps<typeof TripMap>>) => view.rerender(<TripMap pins={[]} activeDay="all" {...props} {...p} />) };
}
const tick = (t: number) => { const q = rafQueue; rafQueue = []; act(() => q.forEach((f) => f(t))); };
const legsData = (m: FakeMap) => m.getSource("legs")!.setData.mock.calls.at(-1)![0].features as Array<{ properties: Record<string, unknown>; geometry: { coordinates: unknown[] } }>;
const live = () => mapbox.markers.filter((k) => !k.removed);
const pinMarkers = () => live().filter((k) => k.opts.element.tagName === "BUTTON");

beforeEach(() => {
  mapbox.reset();
  rafQueue = [];
  tokenOk = true;
  vi.stubGlobal("requestAnimationFrame", (f: (t: number) => void) => { rafQueue.push(f); return rafQueue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => (tokenOk ? new Response(JSON.stringify({ token: "pk.test" }), { status: 200 }) : new Response("{}", { status: 500 }))));
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 1200, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 800, configurable: true });
  document.documentElement.classList.remove("dark");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("TripMap: starting", () => {
  // First in the file on purpose: a token that was fetched once is kept for the session, and only a failed answer is forgotten.
  it("says so when the map cannot be set up", async () => {
    tokenOk = false;
    render(<TripMap pins={[A]} activeDay="all" className="x" />);
    expect(await screen.findByText("The map couldn’t load. Try reloading the page.")).toBeTruthy();
    expect(mapbox.maps).toHaveLength(0);
  });

  it("shows a loading placeholder until the map has loaded", async () => {
    render(<TripMap pins={[A]} activeDay="all" />);
    expect(screen.getByText("Loading map…")).toBeTruthy();
    await waitFor(() => expect(mapbox.maps).toHaveLength(1));
    expect(screen.getByText("Loading map…")).toBeTruthy();
    act(() => { mapbox.maps[0].fire("style.load"); mapbox.maps[0].fire("load"); });
    await waitFor(() => expect(screen.queryByText("Loading map…")).toBeNull());
  });

  it("opens on the first pin, else the fallback centre, else the world", async () => {
    await boot({ pins: [A, C] });
    expect(mapbox.maps[0].opts).toMatchObject({ center: [2.34, 48.86], zoom: 11, style: "mapbox://styles/mapbox/light-v11", logoPosition: "bottom-right", attributionControl: false });
    cleanup(); mapbox.reset();
    await boot({ center: [4.8, 45.7] });
    expect(mapbox.maps[0].opts).toMatchObject({ center: [4.8, 45.7], zoom: 11 });
    cleanup(); mapbox.reset();
    await boot();
    expect(mapbox.maps[0].opts).toMatchObject({ center: [0, 20], zoom: 1.4 });
  });

  it("starts in the dark style when the app is dark", async () => {
    document.documentElement.classList.add("dark");
    await boot({ pins: [A] });
    expect(mapbox.maps[0].opts.style).toBe("mapbox://styles/mapbox/dark-v11");
  });

  it("adds the zoom buttons, and the fit and scale controls only when asked", async () => {
    const { m } = await boot({ pins: [A] });
    expect(m.all("addControl").map((c) => c[1])).toEqual(["Nav"]);
    cleanup(); mapbox.reset();
    const r = await boot({ pins: [A], fitControl: true, scaleBar: true });
    expect(r.m.all("addControl").map((c) => c[1])).toEqual(["Nav", "FitControl", "Scale"]);
    cleanup(); mapbox.reset();
    const c = await boot({ pins: [A], cinematic: true });
    expect(c.m.all("addControl").map((x) => x[1])).toEqual(["Nav", "Scale"]);
  });

  it("says so when the style never loads, but not for a missed tile afterwards", async () => {
    render(<TripMap pins={[A]} activeDay="all" />);
    await waitFor(() => expect(mapbox.maps).toHaveLength(1));
    act(() => mapbox.maps[0].fire("error", undefined, { error: new Error("style") }));
    expect(await screen.findByText("The map couldn’t load. Try reloading the page.")).toBeTruthy();
    cleanup(); mapbox.reset();
    const { m } = await boot({ pins: [A] });
    act(() => m.fire("error", undefined, { error: new Error("tile") }));
    expect(screen.queryByText("The map couldn’t load. Try reloading the page.")).toBeNull();
  });

  it("removes the map when it goes away", async () => {
    const { m, unmount } = await boot({ pins: [A] });
    unmount();
    expect(m.removed).toBe(true);
  });
});

describe("TripMap: the basemap and layers", () => {
  it("draws its sources and route layers once per style", async () => {
    const { m } = await boot({ pins: [A] });
    expect([...m.sources.keys()]).toEqual(["legs", "ghosts"]);
    expect(m.layers.map((l) => l.id)).toEqual(["ghost-casing", "ghost-line", "ghost-hit", "legs-glow", "legs-casing", "legs-halo", "legs", "legs-traffic", "legs-walk", "legs-dashed", "legs-ties", "legs-stops", "legs-rails"]);
    act(() => m.fire("style.load"));
    expect(m.layers).toHaveLength(13);
  });

  it("draws each way of travelling in its own style: ribbons, dots, dashes", async () => {
    const { m } = await boot({ pins: [A] });
    const modes = (id: string) => (m.getLayer(id)!.filter as any[]).at(-1)[1];
    expect(modes("legs")).toEqual(["subway", "tram", "train", "bus", "transit", "drive", "unknown"]);
    expect(modes("legs-casing")).toEqual(modes("legs"));
    expect(m.getLayer("legs-halo")!.filter).toEqual(["!", ["in", ["get", "mode"], ["literal", modes("legs")]]]);
    expect(modes("legs-walk")).toEqual(["walk"]);
    expect(modes("legs-dashed")).toEqual(["ferry", "flight"]);
    expect(modes("legs-ties")).toEqual(["train"]);
    expect(modes("legs-stops")).toEqual(["bus", "transit"]);
    expect(modes("legs-rails")).toEqual(["tram"]);
    expect(m.getLayer("legs-traffic")!.paint["line-color"]).toEqual(["match", ["get", "traffic"], "moderate", "#d79628", "heavy", "#cc2631", "severe", "#9c1b24", "#d79628"]);
  });

  it("adds lit 3D buildings only on the cinematic map", async () => {
    const { m } = await boot({ pins: [A], cinematic: true });
    expect(m.layers.map((l) => l.id)).toContain("trip-3d");
    expect(m.last("setLight")).toBeTruthy();
    cleanup(); mapbox.reset();
    const plain = await boot({ pins: [A] });
    expect(plain.m.layers.map((l) => l.id)).not.toContain("trip-3d");
  });

  it("warms the light basemap toward the app's neutrals, and leaves the dark one alone", async () => {
    render(<TripMap pins={[A]} activeDay="all" />);
    await waitFor(() => expect(mapbox.maps).toHaveLength(1));
    const m = mapbox.maps[0];
    m.styleLayers = [{ id: "land", type: "background" }, { id: "water", type: "fill" }, { id: "waterway-shadow", type: "line" }, { id: "national-park", type: "fill" }, { id: "building", type: "fill" }, { id: "settlement-label", type: "symbol" }, { id: "poi-label", type: "symbol" }];
    act(() => m.fire("style.load"));
    expect(m.paints).toEqual([
      ["land", "background-color", "#f7f5f2"],
      ["water", "fill-color", "#ceecf7"],
      ["waterway-shadow", "line-color", "#b6e0ee"],
      ["national-park", "fill-color", "#def5e8"],
      ["building", "fill-color", "#efebe6"],
      ["settlement-label", "text-color", "#514c46"],
      ["settlement-label", "text-halo-color", "#fdfcfa"],
      ["poi-label", "text-opacity", 0.7],
    ]);
    cleanup(); mapbox.reset();
    document.documentElement.classList.add("dark");
    render(<TripMap pins={[A]} activeDay="all" />);
    await waitFor(() => expect(mapbox.maps).toHaveLength(1));
    mapbox.maps[0].styleLayers = [{ id: "land", type: "background" }];
    act(() => mapbox.maps[0].fire("style.load"));
    expect(mapbox.maps[0].paints).toEqual([]);
  });

  it("swaps the whole basemap when the app changes theme", async () => {
    const { m } = await boot({ pins: [A] });
    await act(async () => { document.documentElement.classList.add("dark"); await Promise.resolve(); });
    await waitFor(() => expect(m.last("setStyle")).toBeTruthy());
    expect(m.last("setStyle")).toEqual(["setStyle", "mapbox://styles/mapbox/dark-v11", { diff: false }]);
  });
});

describe("TripMap: pins", () => {
  it("puts a pin on each place, with its name as the tooltip, in day order", async () => {
    await boot({ pins: [C, A, S, E], activeDay: "all" });
    const ms = pinMarkers();
    expect(ms.map((k) => k.opts.element.title)).toEqual(["Hotel", "Cafe", "Louvre · Day 1", "Versailles · Day 2"]);
    expect(ms.map((k) => k.lngLat)).toEqual([[2.3, 48.84], [2.31, 48.83], [2.34, 48.86], [2.12, 48.8]]);
    expect(ms.every((k) => k.opts.anchor === "bottom")).toBe(true);
  });

  it("numbers the stops in visit order, with a bed for the stay and a dot for the rest", async () => {
    await boot({ pins: [S, A, E, B] });
    const svg = (i: number) => pinMarkers()[i].opts.element.innerHTML;
    expect(svg(0)).toContain("M2 4v16");               // stay: the bed
    expect(svg(1)).toContain("<circle cx=\"0\" cy=\"-35\" r=\"4.5\"");  // eat: a dot
    expect(svg(2)).toMatch(/<text[^>]*>1<\/text>/);    // first stop
    expect(svg(3)).toMatch(/<text[^>]*>2<\/text>/);    // second stop
  });

  it("shows only the chosen day", async () => {
    await boot({ pins: [A, B, C], activeDay: 2 });
    expect(pinMarkers().map((k) => k.opts.element.title)).toEqual(["Versailles · Day 2"]);
  });

  it("opens a place when its pin is clicked", async () => {
    const loc = { href: "" };
    vi.stubGlobal("location", loc);
    await boot({ pins: [A, B] });
    pinMarkers()[0].opts.element.click();
    expect(loc.href).toBe("/p/a");
    loc.href = "";
    pinMarkers()[1].opts.element.click();
    expect(loc.href).toBe("");
  });

  it("puts a pin's name on the left when the right would run off the map", async () => {
    await boot({ pins: [pin("n", "Near", 11.9, 48, { day: 1 }), pin("f", "Far", 2, 48, { day: 1 })] });
    const sides = pinMarkers().map((k) => k.opts.element.querySelector<HTMLElement>(".trip-pin-label")!.dataset.side);
    expect(sides).toEqual(["left", "right"]);
  });

  it("redraws when the pins change, removing the old ones", async () => {
    const { m, rerenderWith } = await boot({ pins: [A, B] });
    const first = [...pinMarkers()];
    rerenderWith({ pins: [C] });
    expect(first.every((k) => k.removed)).toBe(true);
    expect(pinMarkers().map((k) => k.opts.element.title)).toEqual(["Versailles · Day 2"]);
    expect(m.all("fitBounds").length + m.all("easeTo").length).toBeGreaterThan(1);
  });
});

describe("TripMap: framing", () => {
  it("eases to a single pin", async () => {
    const { m } = await boot({ pins: [A], inset: { left: 100, bottom: 50 } });
    expect(m.last("easeTo")![1]).toEqual({ center: [2.34, 48.86], zoom: 13, duration: 700, padding: { top: 0, right: 0, bottom: 50, left: 100 } });
  });

  it("fits the route with room for the chrome that floats over the map", async () => {
    const { m } = await boot({ pins: [A, B] });
    const [, bounds, opts] = m.last("fitBounds")! as [string, { points: unknown[] }, Record<string, unknown>];
    expect(bounds.points).toEqual([[2.34, 48.86], [2.34, 48.86], [2.29, 48.85]]);
    expect(opts).toEqual({ padding: { top: 84, right: 150, bottom: 64, left: 48 }, maxZoom: 15, duration: 900, pitch: 0, bearing: 0 });
  });

  it("makes room on the left for a side panel and at the bottom for a sheet", async () => {
    const side = await boot({ pins: [A, B], inset: { left: 436 } });
    expect((side.m.last("fitBounds")![2] as any).padding).toEqual({ top: 84, right: 150, bottom: 64, left: 484 });
    cleanup(); mapbox.reset();
    const sheet = await boot({ pins: [A, B], inset: { bottom: 300 } });
    expect((sheet.m.last("fitBounds")![2] as any).padding).toEqual({ top: 84, right: 150, bottom: 404, left: 48 });
  });

  it("gives the route a smaller share of the margin when the map is small", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 400, configurable: true });
    const { m } = await boot({ pins: [A, B], inset: { left: 300 } });
    const p = (m.last("fitBounds")![2] as any).padding;
    expect(p.left).toBeLessThan(348);
    expect(p.left / p.top).toBeCloseTo(348 / 84, 5);
  });

  it("tilts the camera and arrives from above on the cinematic map, the first time only", async () => {
    const { m, rerenderWith } = await boot({ pins: [A, B], cinematic: true });
    expect(m.last("jumpTo")![1]).toMatchObject({ pitch: 0, bearing: 0 });
    expect(m.last("fitBounds")![2]).toMatchObject({ pitch: 40, duration: 2600 });
    rerenderWith({ pins: [A, C], cinematic: true });
    expect(m.all("jumpTo")).toHaveLength(1);
    expect(m.last("fitBounds")![2]).toMatchObject({ pitch: 40, duration: 900 });
  });

  it("reframes the route from the fit button", async () => {
    const { m } = await boot({ pins: [A, B], fitControl: true });
    const control = m.all("addControl").find((c) => c[1] === "FitControl")![2] as { onAdd: () => HTMLElement };
    const box = control.onAdd();
    const before = m.all("fitBounds").length;
    box.querySelector("button")!.click();
    expect(m.all("fitBounds")).toHaveLength(before + 1);
    expect(m.last("fitBounds")![2]).toMatchObject({ duration: 1100, maxZoom: 15 });
    expect(box.querySelector("button")!.getAttribute("aria-label")).toBe("Fit the route");
  });
});

describe("TripMap: lines", () => {
  it("draws the legs it is given, each in its mode's colour, with dimmed ones marked", async () => {
    const { m } = await boot({ pins: [A, B], legs: [leg("walk", [[2.34, 48.86], [2.31, 48.855]], { dim: true }), leg("subway", [[2.31, 48.855], [2.29, 48.85]], { traffic: "heavy" })] });
    tick(10_000);
    expect(legsData(m).map((f) => f.properties)).toEqual([
      { mode: "walk", color: "#68625c", dim: true, traffic: "" },
      { mode: "subway", color: "#215d96", dim: false, traffic: "heavy" },
    ]);
  });

  it("joins the pins with a straight line when there are no legs, unless told not to", async () => {
    const { m } = await boot({ pins: [A, B] });
    tick(10_000);
    expect(legsData(m)).toHaveLength(1);
    expect(legsData(m)[0].properties.mode).toBe("transit");
    cleanup(); mapbox.reset();
    const none = await boot({ pins: [A, B], connect: false });
    tick(10_000);
    expect(none.m.getSource("legs")!.setData.mock.calls.at(-1)![0].features).toEqual([]);
  });

  it("reveals a new route gradually, then settles on the whole line", async () => {
    const { m } = await boot({ pins: [A, B], legs: [L1] });
    const now = performance.now();
    tick(now + 300);
    const partial = legsData(m)[0].geometry.coordinates.length;
    expect(partial).toBeGreaterThan(0);
    tick(now + 5000);
    expect(legsData(m)[0].geometry.coordinates).toEqual(L1.polyline);
  });

  it("rides a marker along the route, in the colour and icon of the current mode", async () => {
    await boot({ pins: [A, B], legs: [L1] });
    tick(performance.now() + 100);
    const rider = live().find((k) => k.opts.element.className.includes("trip-rider"))!;
    expect(rider.opts.element.style.background).toBeTruthy();
    expect(rider.opts.element.innerHTML).toContain("<svg");
  });

  it("does not restart the reveal when only the dim flag changes", async () => {
    const dimmed = { ...L1, dim: true };
    const { m, rerenderWith } = await boot({ pins: [A, B], legs: [L1] });
    tick(performance.now() + 5000);
    rerenderWith({ legs: [dimmed] });
    tick(performance.now() + 5100);
    expect(legsData(m)[0].geometry.coordinates).toEqual(L1.polyline);
    expect(legsData(m)[0].properties.dim).toBe(true);
  });

  it("draws nothing when there is no route", async () => {
    const { m } = await boot({ pins: [A] });
    expect(m.getSource("legs")!.setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });
  });
});

describe("TripMap: Browse", () => {
  const route = { legs: [leg("train", [[2.35, 48.85], [3, 47], [4.83, 45.76]])] };

  it("marks A and B at the ends of the chosen route and frames it", async () => {
    const { m } = await boot({ pins: [], browse: route });
    const ends = live().filter((k) => k.opts.anchor === "bottom");
    expect(ends.map((k) => k.lngLat)).toEqual([[2.35, 48.85], [4.83, 45.76]]);
    expect(ends[0].opts.element.innerHTML).toMatch(/<text[^>]*>A<\/text>/);
    expect(ends[1].opts.element.innerHTML).toMatch(/<text[^>]*>B<\/text>/);
    expect(m.last("fitBounds")).toBeTruthy();
    tick(10_000);
    expect(legsData(m)).toHaveLength(1);
  });

  it("just sits on the destination until a route is chosen", async () => {
    const { m } = await boot({ pins: [], browse: null, center: [2.35, 48.85] });
    expect(m.last("easeTo")![1]).toEqual({ center: [2.35, 48.85], zoom: 11, duration: 600 });
    expect(live().filter((k) => k.opts.anchor === "bottom")).toHaveLength(0);
  });
});

describe("TripMap: overlay", () => {
  it("draws other routes quietly and lets a tap on one choose it", async () => {
    const onSelect = vi.fn();
    const { m } = await boot({ pins: [A, B], overlay: { ghosts: [{ id: "g1", polyline: [[2.3, 48.8], [2.4, 48.9]], onSelect }, { id: "short", polyline: [[2, 48]], onSelect: vi.fn() }] } });
    const data = m.getSource("ghosts")!.setData.mock.calls.at(-1)![0];
    expect(data.features).toEqual([{ type: "Feature", properties: { id: "g1" }, geometry: { type: "LineString", coordinates: [[2.3, 48.8], [2.4, 48.9]] } }]);
    act(() => m.fire("click", "ghost-hit", { features: [{ properties: { id: "g1" } }] }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => m.fire("mouseenter", "ghost-hit"));
    expect(m.canvas.style.cursor).toBe("pointer");
    act(() => m.fire("mouseleave", "ghost-hit"));
    expect(m.canvas.style.cursor).toBe("");
  });

  it("puts the time on a route, as a button when it can be taken", async () => {
    const onClick = vi.fn();
    await boot({ pins: [A, B], overlay: { pills: [{ id: "p1", polyline: [[2.3, 48.8], [2.4, 48.9]], text: "12 min", tone: "main" }, { id: "p2", polyline: [[2.3, 48.8], [2.4, 48.9]], text: "20 min", tone: "ghost", onClick }, { id: "p3", polyline: [[2.3, 48.8]], text: "skip" }] } });
    const pills = live().filter((k) => k.opts.element.querySelector(".trip-pill"));
    expect(pills).toHaveLength(2);
    const first = pills[0].opts.element.querySelector(".trip-pill")!;
    expect(first.tagName).toBe("SPAN");
    expect(first.textContent).toBe("12 min");
    const second = pills[1].opts.element.querySelector<HTMLButtonElement>(".trip-pill")!;
    expect(second.tagName).toBe("BUTTON");
    expect(second.className).toContain("trip-pill--ghost");
    expect(second.getAttribute("aria-label")).toBe("Take the route that takes 20 min");
    second.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("slides pills that would overlap along their own routes", async () => {
    const same: Array<[number, number]> = [[2.3, 48.8], [2.4, 48.9]];
    await boot({ pins: [A, B], overlay: { pills: [{ id: "p1", polyline: same, text: "1" }, { id: "p2", polyline: same, text: "2" }] } });
    const pills = live().filter((k) => k.opts.element.querySelector(".trip-pill"));
    expect(pills[0].lngLat).not.toEqual(pills[1].lngLat);
  });

  it("marks where the day changes vehicle, naming the place only when close in", async () => {
    const { m } = await boot({ pins: [A, B], overlay: { nodes: [{ id: "n1", at: [2.31, 48.85], label: "Gare", color: "#215d96" }, { id: "n2", at: [2.32, 48.86], color: "#8c6c1f" }] } });
    const nodes = live().filter((k) => k.opts.element.querySelector(".trip-node"));
    expect(nodes.map((k) => k.lngLat)).toEqual([[2.31, 48.85], [2.32, 48.86]]);
    expect(nodes[0].opts.element.querySelector(".trip-node-label")?.textContent).toBe("Gare");
    expect(nodes[1].opts.element.querySelector(".trip-node-label")).toBeNull();
    expect(m.container.hasAttribute("data-near")).toBe(false);
    m.zoom = 13;
    act(() => m.fire("zoomend"));
    expect(m.container.hasAttribute("data-near")).toBe(true);
  });

  it("takes the overlay away when it is cleared", async () => {
    const { rerenderWith } = await boot({ pins: [A, B], overlay: { nodes: [{ id: "n1", at: [2.31, 48.85], color: "#000" }] } });
    expect(live().filter((k) => k.opts.element.querySelector(".trip-node"))).toHaveLength(1);
    rerenderWith({ overlay: undefined });
    expect(live().filter((k) => k.opts.element.querySelector(".trip-node"))).toHaveLength(0);
  });
});
