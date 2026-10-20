import type { MapInset, MapPin } from "@/components/TripMap";

/** A map-pin teardrop whose tip is the exact coordinate (pair with `anchor: "bottom"`). */
const BED = "M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9";
export function pinSvg(color: string, mark: number | string | null): string {
  const head =
    mark === "bed"
      ? `<g transform="translate(-7 -42) scale(0.58)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${BED}"/></g>`
      : mark === null
        ? `<circle cx="0" cy="-35" r="4.5" fill="${color}"/>`
        : `<text x="0" y="-30.5" text-anchor="middle" font-size="13" font-weight="700" font-family="Outfit, system-ui, sans-serif" fill="${color}">${mark}</text>`;
  return `<svg width="32" height="46" viewBox="-19 -55 38 56" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;filter:drop-shadow(0 7px 6px rgb(27 22 17 / 0.30))">
    <path d="M0 0C-9-14-19-22-19-35A19 19 0 1 1 19-35C19-22 9-14 0 0Z" fill="${color}" stroke="white" stroke-width="3" paint-order="stroke"/>
    <circle cx="0" cy="-35" r="10" fill="white"/>
    ${head}
  </svg>`;
}

/** Margins that keep the route clear of the chrome floating over the map (a side panel, a sheet) and room for a stop's name chip. */
export function framingPadding(inset: MapInset | undefined, w: number, h: number, cinematic: boolean) {
  const left = (inset?.left ?? 0) + 48;
  // A stop's name chip hangs off the right of its pin: leave it room when there is room to give.
  const free = w - left - (inset?.right ?? 0);
  const right = (inset?.right ?? 0) + (free > 620 ? 150 : free > 420 ? 96 : 44);
  const top = (inset?.top ?? 0) + 84;
  // Room under the route for the legend (beside a panel) or the sheet's own rounded top (over a sheet).
  const bottom = (inset?.bottom ?? 0) + (cinematic && (inset?.left ?? 0) > 0 ? 84 : inset?.bottom ? 104 : 64);
  // Never ask for more room than the map has: Mapbox then gives up on framing at all.
  const k = Math.min(1, (w * 0.82) / (left + right), (h * 0.82) / (top + bottom));
  return { top: top * k, right: right * k, bottom: bottom * k, left: left * k };
}

/** A pin's name goes on its right; where that would run off the map, it goes on the left instead. */
export const labelSide = (pinX: number, labelWidth: number, mapWidth: number): "left" | "right" => (pinX + 38 + labelWidth > mapWidth - 64 ? "left" : "right");

/** The pins to draw for the chosen day, in day order. */
export const pinsShown = (pins: MapPin[], activeDay: number | "all") =>
  pins.filter((p) => activeDay === "all" || p.day === activeDay).sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
