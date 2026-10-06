import { Bus, Car, Footprints, Plane, Route, Ship, TrainFront, TramFront } from "lucide-react";

/**
 * One shared palette/icon set for a way of getting around: TripMap (the Mapbox line paint), the
 * day's timeline and the route panel. Kept free of mapbox-gl so importing it costs nothing.
 *
 * Colour names the family and the texture drawn inside the line names the vehicle (TripMap), so a
 * journey that mixes modes reads without a legend. These sit in one lightness/chroma band (about
 * L 0.47, C 0.1) so no mode shouts over the coral trip pins: blue metro, teal rail, ochre bus,
 * plum tram, lagoon ferry, soft ink on foot, ink by car. Hex because Mapbox and inline styles
 * need it; see DESIGN.md "Getting around".
 */
export const MODE_COLOR: Record<string, string> = {
  walk: "#68625c",
  bus: "#8c6c1f",
  subway: "#215d96",
  tram: "#77468b",
  train: "#006b58",
  ferry: "#208295",
  drive: "#1b1611",
  transit: "#215d96",
  flight: "#754d9e",
  unknown: "#68625c",
};

/** The pale ground that goes behind a mode's icon or badge. */
export const MODE_SOFT: Record<string, string> = {
  walk: "#f2f0ec",
  bus: "#faf1dc",
  subway: "#e6f2fe",
  tram: "#f7eefb",
  train: "#e3f5ef",
  ferry: "#e4f6fa",
  drive: "#f2f0ec",
  transit: "#e6f2fe",
  flight: "#f6f1fe",
  unknown: "#f2f0ec",
};

export const MODE_LABEL: Record<string, string> = {
  walk: "Walk",
  bus: "Bus",
  subway: "Metro",
  tram: "Tram",
  train: "Train",
  ferry: "Ferry",
  drive: "Drive",
  transit: "Transit",
  flight: "Flight",
  unknown: "Route",
};

export const MODE_ICON: Record<string, typeof Bus> = {
  walk: Footprints, bus: Bus, subway: TrainFront, tram: TramFront, train: TrainFront, ferry: Ship, drive: Car, transit: Bus, flight: Plane, unknown: Route,
};

/** Traffic and state colours drawn over a route (amber slow, red heavy). */
export const TRAFFIC_HEX = { slow: "#d79628", heavy: "#cc2631", severe: "#9c1b24" } as const;

/** Itinerary stops on the map and in their lists: the same coral as the dots on the Plan timeline. */
export const STOP_CORAL = "#bc4527";
