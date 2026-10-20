import { vi } from "vitest";

/** A stand-in for mapbox-gl that records what the map was asked to do, so a test can read the behaviour without WebGL. */
type Handler = (e?: any) => void;
export const mapbox = {
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  controls: [] as string[],
  reset() { this.maps = []; this.markers = []; this.controls = []; },
};

export class FakeMarker {
  lngLat: [number, number] = [0, 0];
  removed = false;
  added = false;
  constructor(public opts: { element: HTMLElement; anchor?: string }) { mapbox.markers.push(this); }
  setLngLat(c: [number, number]) { this.lngLat = c; return this; }
  getLngLat() { return { lng: this.lngLat[0], lat: this.lngLat[1] }; }
  addTo() { this.added = true; return this; }
  remove() { this.removed = true; return this; }
  getElement() { return this.opts.element; }
}

export class FakeBounds {
  points: Array<[number, number]> = [];
  constructor(a?: [number, number], b?: [number, number]) { if (a) this.points.push(a); if (b && b !== a) this.points.push(b); }
  extend(c: [number, number]) { this.points.push(c); return this; }
  getCenter() { return { lng: this.points[0]?.[0] ?? 0, lat: this.points[0]?.[1] ?? 0 }; }
}

export class FakeMap {
  handlers: Record<string, Array<{ layer?: string; fn: Handler }>> = {};
  sources = new Map<string, { data: any; setData: ReturnType<typeof vi.fn> }>();
  layers: Array<{ id: string; [k: string]: any }> = [];
  paints: Array<[string, string, unknown]> = [];
  calls: Array<[string, ...any[]]> = [];
  canvas = { style: { cursor: "" } };
  container = document.createElement("div");
  zoom = 11;
  removed = false;
  styleLayers: Array<{ id: string; type: string }> = [];
  constructor(public opts: Record<string, any>) {
    mapbox.maps.push(this);
    Object.defineProperty(this.container, "clientWidth", { value: 1200, configurable: true });
  }
  addControl(c: { constructor: { name: string } }) { this.calls.push(["addControl", c.constructor.name, c]); }
  on(type: string, a: any, b?: Handler) { (this.handlers[type] ??= []).push(b ? { layer: a, fn: b } : { fn: a }); }
  off(type: string, fn: Handler) { this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h.fn !== fn); }
  fire(type: string, layer?: string, e?: any) { for (const h of [...(this.handlers[type] ?? [])]) if (h.layer === layer) h.fn(e); }
  getSource(id: string) { return this.sources.get(id); }
  addSource(id: string, spec: { data: unknown }) { this.sources.set(id, { data: spec.data, setData: vi.fn() }); }
  getLayer(id: string) { return this.layers.find((l) => l.id === id); }
  addLayer(layer: { id: string }, before?: string) { this.layers.push(layer); this.calls.push(["addLayer", layer.id, before]); }
  getStyle() { return { layers: this.styleLayers }; }
  setPaintProperty(id: string, prop: string, value: unknown) { this.paints.push([id, prop, value]); }
  setLight(l: unknown) { this.calls.push(["setLight", l]); }
  setStyle(style: string, opts: unknown) { this.calls.push(["setStyle", style, opts]); }
  getCanvas() { return this.canvas; }
  getContainer() { return this.container; }
  getZoom() { return this.zoom; }
  resize() { this.calls.push(["resize"]); }
  remove() { this.removed = true; }
  project(c: { lng: number; lat: number } | [number, number]) { const [lng, lat] = Array.isArray(c) ? c : [c.lng, c.lat]; return { x: lng * 100, y: lat * 100 }; }
  jumpTo(o: unknown) { this.calls.push(["jumpTo", o]); }
  fitBounds(b: FakeBounds, o: unknown) { this.calls.push(["fitBounds", b, o]); }
  easeTo(o: unknown) { this.calls.push(["easeTo", o]); }
  last(name: string) { return [...this.calls].reverse().find((c) => c[0] === name); }
  all(name: string) { return this.calls.filter((c) => c[0] === name); }
}

class Nav { constructor(public o?: unknown) { mapbox.controls.push("nav"); } }
class Scale { constructor(public o?: unknown) { mapbox.controls.push("scale"); } }

export const fakeMapboxModule = () => ({
  default: { accessToken: "", Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeBounds, NavigationControl: Nav, ScaleControl: Scale },
});
