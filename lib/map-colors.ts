/**
 * Place-category colours for the map and its legends. Mapbox and inline styles need hex, so these
 * are the sRGB twins of `--cat-*` in app/globals.css (same OKLCH values, light mode). Change one
 * place, change the other.
 */
export const CATEGORY_HEX = {
  stay: "#cc4c28",
  eat: "#b47819",
  see: "#2684ae",
  do: "#2f8e60",
  event: "#8656b7",
  saved: "#847f78",
} as const;

export type CategoryKind = keyof typeof CATEGORY_HEX;

/** Default route line when a provider gives none: a deep lagoon blue, readable on any basemap. */
export const ROUTE_LINE_HEX = "#1666aa";
