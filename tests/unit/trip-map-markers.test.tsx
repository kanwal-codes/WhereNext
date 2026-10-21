// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { lineString } from "@turf/helpers";
import turfLength from "@turf/length";
import { endpointPin, nodeElement, pillElement, riderIconHtml, spreadPillSpots, stopPin } from "../../components/tripMapMarkers";
import type { MapPin } from "../../components/TripMap";

const KIND: Record<MapPin["kind"], string> = { stay: "#s", eat: "#e", see: "#v", do: "#d", event: "#x", saved: "#a" };
const pin = (over: Partial<MapPin> = {}): MapPin => ({ id: "p", name: "Louvre", lng: 2.3, lat: 48.8, kind: "see", ...over });

describe("tripMapMarkers: pins", () => {
  it("labels the two ends of a route A and B and drops them one after the other", () => {
    const a = endpointPin("A", "#111");
    const b = endpointPin("B", "#222");
    expect((a.firstElementChild as HTMLElement).style.animationDelay).toBe("120ms");
    expect((b.firstElementChild as HTMLElement).style.animationDelay).toBe("260ms");
    expect(a.innerHTML).toContain("A");
    expect(b.innerHTML).toContain("B");
  });

  it("numbers an itinerary stop, shows a bed for the stay, a plain dot otherwise", () => {
    expect(stopPin(pin({ day: 1 }), 0, 3, KIND).innerHTML).toContain("3");
    expect(stopPin(pin({ kind: "stay" }), 0, null, KIND).innerHTML).toContain("#1b1611");
    expect(stopPin(pin({ kind: "eat" }), 0, null, KIND).innerHTML).toContain("#e");
  });

  it("titles a pin with its day, staggers the drop, and carries the name beside it", () => {
    const el = stopPin(pin({ day: 2 }), 2, 1, KIND);
    expect(el.title).toBe("Louvre · Day 2");
    expect(stopPin(pin(), 0, null, KIND).title).toBe("Louvre");
    expect((el.firstElementChild as HTMLElement).style.animationDelay).toBe("280ms");
    expect(el.querySelector(".trip-pin-label")?.textContent).toBe("Louvre");
  });

  it("only links a pin that has somewhere to go", () => {
    expect(stopPin(pin(), 0, null, KIND).onclick).toBeNull();
    expect(typeof stopPin(pin({ href: "/x" }), 0, null, KIND).onclick).toBe("function");
  });
});

describe("tripMapMarkers: route furniture", () => {
  it("makes a pill tappable only when it can do something, and stops the tap reaching the map", () => {
    const plain = pillElement({ id: "a", text: "1h 10m", polyline: [] }, 0).firstElementChild as HTMLElement;
    expect(plain.tagName).toBe("SPAN");
    const onClick = vi.fn();
    const tappable = pillElement({ id: "b", text: "2h", polyline: [], tone: "ghost", onClick }, 1).firstElementChild as HTMLElement;
    expect(tappable.tagName).toBe("BUTTON");
    expect(tappable.getAttribute("aria-label")).toBe("Take the route that takes 2h");
    expect(tappable.className).toContain("trip-pill--ghost");
    expect(tappable.style.animationDelay).toBe("970ms");
    const event = new MouseEvent("click", { bubbles: true });
    const stop = vi.spyOn(event, "stopPropagation");
    tappable.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalled();
  });

  it("names an interchange only when it has a name", () => {
    expect(nodeElement({ id: "n", at: [0, 0], color: "#abc" }).querySelector(".trip-node-label")).toBeNull();
    const named = nodeElement({ id: "n", at: [0, 0], color: "#abc", label: "Gare du Nord" });
    expect(named.querySelector(".trip-node-label")?.textContent).toBe("Gare du Nord");
    expect((named.firstElementChild as HTMLElement).style.getPropertyValue("--node")).toBe("#abc");
  });

  it("draws an icon for known vehicles and falls back for unknown ones", () => {
    expect(riderIconHtml("walk")).toContain("<svg");
    expect(riderIconHtml("hovercraft")).toBe(riderIconHtml("unknown"));
  });
});

describe("tripMapMarkers: spreading pills along their routes", () => {
  const line = lineString([[0, 0], [0.1, 0]]);
  const km = turfLength(line, { units: "kilometers" });
  const project = ([lng, lat]: [number, number]) => ({ x: lng * 5000, y: lat * 5000 });

  it("leaves a lone pill at its own place", () => {
    const [spot] = spreadPillSpots([{ line, km, at: 0.5 }], project);
    expect(spot[0]).toBeCloseTo(0.05, 3);
  });

  it("moves a second pill off the first when two routes share a road", () => {
    const [first, second] = spreadPillSpots([{ line, km, at: 0.5 }, { line, km, at: 0.5 }], project);
    expect(first[0]).toBeCloseTo(0.05, 3);
    expect(Math.abs(project(second).x - project(first).x)).toBeGreaterThan(76);
  });

  it("never pushes a pill off the ends of its route", () => {
    const spots = spreadPillSpots([0.95, 0.95, 0.95, 0.02, 0.02, 0.02].map((at) => ({ line, km, at })), project);
    for (const [lng] of spots) {
      expect(lng).toBeGreaterThanOrEqual(0.1 * 0.08 - 1e-6);
      expect(lng).toBeLessThanOrEqual(0.1 * 0.92 + 1e-6);
    }
  });
});
