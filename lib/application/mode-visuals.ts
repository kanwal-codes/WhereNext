import { Bus, Car, Footprints, Plane, Route, Ship, TrainFront } from "lucide-react";

/** One shared palette/icon set for a transport mode — used by TripMap (the Mapbox layer paint)
 * and RouteTimeline (the day's leg list), kept in a side-effect-free module so importing it
 * doesn't drag mapbox-gl into a bundle that only needs the colors/icons. */
export const MODE_COLOR: Record<string, string> = {
  walk: "#9aa0a6", bus: "#2563eb", subway: "#e2603f", tram: "#0891b2", train: "#16a34a", ferry: "#0d9488", drive: "#6b7280", transit: "#2563eb", flight: "#7c3aed", unknown: "#9aa0a6",
};

export const MODE_ICON: Record<string, typeof Bus> = {
  walk: Footprints, bus: Bus, subway: TrainFront, tram: TrainFront, train: TrainFront, ferry: Ship, drive: Car, transit: Bus, flight: Plane, unknown: Route,
};
