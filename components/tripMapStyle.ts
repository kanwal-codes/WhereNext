import { TRAFFIC_HEX } from "@/lib/application/mode-visuals";

/** Basemap, warmed toward the app's own neutrals: land is warm stone, water is the lagoon, parks are sage. */
const BASE = { land: "#f7f5f2", water: "#ceecf7", waterway: "#b6e0ee", park: "#def5e8", building: "#efebe6", label: "#514c46", labelHalo: "#fdfcfa" } as const;

/** Modes drawn as a solid ribbon; the others are dotted (on foot) or dashed (across water, by air). */
const SOLID = ["subway", "tram", "train", "bus", "transit", "drive", "unknown"];
const DASHED = ["ferry", "flight"];

const modeIn = (...modes: string[]): mapboxgl.ExpressionSpecification => ["in", ["get", "mode"], ["literal", modes]];
const byMode = (values: Record<string, number>, fallback: number): mapboxgl.ExpressionSpecification =>
  ["match", ["get", "mode"], ...Object.entries(values).flatMap(([k, v]) => [k, v]), fallback] as unknown as mapboxgl.ExpressionSpecification;
const dimmed = (full: number, dim: number): mapboxgl.ExpressionSpecification => ["case", ["get", "dim"], dim, full];
/** A width that breathes with zoom: thin on a city overview, full weight when you lean in. */
const widthAt = (expr: mapboxgl.ExpressionSpecification | number): mapboxgl.ExpressionSpecification =>
  ["interpolate", ["linear"], ["zoom"], 9, ["*", 0.6, expr], 13, ["*", 1.15, expr], 17, ["*", 1.7, expr]] as unknown as mapboxgl.ExpressionSpecification;

const RIBBON = { subway: 7, tram: 7, train: 7, drive: 7.5, bus: 6, transit: 6 };

/** Paint overrides that warm the light basemap toward the app's neutrals: `[layer id, property, value]`. Empty for the dark style. */
export function basemapPaints(layers: Array<{ id: string; type: string }>, dark: boolean): Array<[string, string, unknown]> {
  if (dark) return [];
  const out: Array<[string, string, unknown]> = [];
  const set = (id: string, prop: string, value: unknown) => out.push([id, prop, value]);
  for (const { id, type } of layers) {
    if (type === "background") set(id, "background-color", BASE.land);
    else if (id === "land") set(id, "background-color", BASE.land);
    else if (type === "fill" && /^water$|^water-/.test(id)) set(id, "fill-color", BASE.water);
    else if (type === "line" && /^waterway/.test(id)) set(id, "line-color", BASE.waterway);
    else if (type === "fill" && /landcover|national-park|landuse|park/.test(id)) set(id, "fill-color", BASE.park);
    else if (type === "fill" && id === "building") set(id, "fill-color", BASE.building);
    else if (type === "symbol" && /settlement|road-label|natural-point|water/.test(id)) {
      set(id, "text-color", BASE.label);
      set(id, "text-halo-color", BASE.labelHalo);
    } else if (type === "symbol" && /poi-label|transit-label/.test(id)) set(id, "text-opacity", 0.7);
  }
  return out;
}

// Custom sources/layers don't reliably survive `setStyle()` across a full basemap swap
// (dark-v11 <-> light-v11), so this re-adds them idempotently — called on the initial
// style load AND every subsequent one (a live theme-toggle triggers another `style.load`).
export function addLegLayers(m: mapboxgl.Map, cinematic: boolean) {
  if (m.getSource("legs")) return;
  m.addSource("legs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const color: mapboxgl.ExpressionSpecification = ["get", "color"];
  const round = { "line-cap": "round", "line-join": "round" } as const;
  const butt = { "line-cap": "butt", "line-join": "round" } as const;

  // Cinematic: buildings rise out of the map when the camera leans in, lit warm from the upper left.
  if (cinematic && !m.getLayer("trip-3d")) {
    try {
      const firstLabel = m.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
      m.addLayer({
        id: "trip-3d",
        type: "fill-extrusion",
        source: "composite",
        "source-layer": "building",
        minzoom: 13.6,
        filter: ["==", ["get", "extrude"], "true"],
        paint: {
          "fill-extrusion-color": "#e8e2da",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 13.6, 0, 14.8, 0.86],
          "fill-extrusion-vertical-gradient": true,
        },
      }, firstLabel);
      m.setLight({ anchor: "viewport", color: "#fff3e4", intensity: 0.42, position: [1.25, 215, 38] });
    } catch { /* a style without a building layer */ }
  }

  // Other ways to get there: a quiet line behind the chosen one, with a wide invisible stroke to make it easy to hit.
  m.addSource("ghosts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  m.addLayer({ id: "ghost-casing", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(9.5), "line-opacity": 0.8 } });
  m.addLayer({ id: "ghost-line", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#bdb6ad", "line-width": widthAt(4.6), "line-opacity": 0.95 } });
  m.addLayer({ id: "ghost-hit", type: "line", source: "ghosts", layout: round, paint: { "line-color": "#000000", "line-width": 22, "line-opacity": 0 } });

  // A soft light under everything, so a route glows off the map instead of lying on it.
  m.addLayer({ id: "legs-glow", type: "line", source: "legs", layout: round, paint: { "line-color": color, "line-width": widthAt(dimmed(16, 6) as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(0.22, 0.08), "line-blur": 8 } });
  // White casing: the edge that lifts a ribbon off roads of any colour.
  m.addLayer({ id: "legs-casing", type: "line", source: "legs", filter: modeIn(...SOLID), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(["*", ["+", byMode(RIBBON, 6), 5], dimmed(1, 0.55)] as unknown as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(0.96, 0.5) } });
  // Dots, dashes and dashes-across-water get a plain white halo so they stay readable over streets.
  m.addLayer({ id: "legs-halo", type: "line", source: "legs", filter: ["!", modeIn(...SOLID)] as mapboxgl.ExpressionSpecification, layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(9.5, 5)), "line-opacity": dimmed(0.88, 0.4) } });
  m.addLayer({ id: "legs", type: "line", source: "legs", filter: modeIn(...SOLID), layout: round, paint: { "line-color": color, "line-width": widthAt(["*", byMode(RIBBON, 6), dimmed(1, 0.55)] as unknown as mapboxgl.ExpressionSpecification), "line-opacity": dimmed(1, 0.4) } });
  // On foot: dots.
  // Congestion: amber where it slows, red where it stops, painted inside the drive ribbon.
  m.addLayer({ id: "legs-traffic", type: "line", source: "legs", filter: ["in", ["get", "traffic"], ["literal", ["moderate", "heavy", "severe"]]], layout: butt, paint: { "line-color": ["match", ["get", "traffic"], "moderate", TRAFFIC_HEX.slow, "heavy", TRAFFIC_HEX.heavy, "severe", TRAFFIC_HEX.severe, TRAFFIC_HEX.slow], "line-width": widthAt(dimmed(5.6, 3)), "line-opacity": dimmed(1, 0.4) } });
  m.addLayer({ id: "legs-walk", type: "line", source: "legs", filter: modeIn("walk"), layout: round, paint: { "line-color": color, "line-width": widthAt(dimmed(4.6, 3)), "line-opacity": dimmed(1, 0.45), "line-dasharray": [0.01, 2.3] } });
  // Over water or by air: dashes.
  m.addLayer({ id: "legs-dashed", type: "line", source: "legs", filter: modeIn(...DASHED), layout: butt, paint: { "line-color": color, "line-width": widthAt(dimmed(5, 3)), "line-opacity": dimmed(1, 0.45), "line-dasharray": [2, 1.5] } });
  // The texture inside the ribbon says which vehicle it is: rail ties, bus stops, tram rails.
  m.addLayer({ id: "legs-ties", type: "line", source: "legs", filter: modeIn("train"), layout: butt, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2.4, 1.4)), "line-opacity": dimmed(0.95, 0.4), "line-dasharray": [1.3, 1.3] } });
  m.addLayer({ id: "legs-stops", type: "line", source: "legs", filter: modeIn("bus", "transit"), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2.8, 1.6)), "line-opacity": dimmed(0.95, 0.4), "line-dasharray": [0.01, 3.4] } });
  m.addLayer({ id: "legs-rails", type: "line", source: "legs", filter: modeIn("tram"), layout: round, paint: { "line-color": "#ffffff", "line-width": widthAt(dimmed(2, 1.2)), "line-opacity": dimmed(0.95, 0.4) } });
}

/** The Mapbox control that frames the whole route again after the reader has wandered off. */
export class FitControl implements mapboxgl.IControl {
  private box: HTMLDivElement | null = null;
  constructor(private readonly onFit: () => void) {}
  onAdd() {
    const box = document.createElement("div");
    box.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Fit the route";
    btn.setAttribute("aria-label", "Fit the route");
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin:auto"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"/></svg>`;
    btn.onclick = this.onFit;
    box.appendChild(btn);
    this.box = box;
    return box;
  }
  onRemove() {
    this.box?.remove();
    this.box = null;
  }
}
