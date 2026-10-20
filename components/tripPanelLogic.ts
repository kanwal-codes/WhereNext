import { haversineKm } from "@/lib/application/geo";
import { formatDuration } from "@/lib/utils";
import { panelTitle, type CompareEntry, type PanelState } from "@/components/TripPanelProvider";

export type Anchor = { name: string; lat: number; lng: number } | null;
export function distanceLabel(entry: CompareEntry, anchor: Anchor): string {
  if (!anchor || entry.attrs.lat == null || entry.attrs.lng == null) return "—";
  // Was a private re-implementation of `lib/application/geo.ts`'s `haversineKm` — missing that
  // function's `Math.min(1, ...)` clamp before `Math.asin()`, which guards against floating-point
  // rounding pushing the pre-asin value fractionally past 1 (asin of >1 is `NaN`) for two very
  // close or near-antipodal points. Same bug, same fix as `route-plan/route.ts`'s copy.
  const d = haversineKm({ latitude: anchor.lat, longitude: anchor.lng }, { latitude: entry.attrs.lat, longitude: entry.attrs.lng });
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}
/** The routed full-page equivalent of whatever the panel is showing. */
export function fullPageHref(panel: PanelState, tripId: string, compareIds: string[]): string {
  const base = `/trips/${tripId}`;
  switch (panel.kind) {
    case "place":
      return `${base}/place/${encodeURIComponent(panel.placeId)}`;
    case "stay": {
      const qs = new URLSearchParams();
      if (panel.checkin) qs.set("checkin", panel.checkin);
      if (panel.checkout) qs.set("checkout", panel.checkout);
      return `${base}/stay/${encodeURIComponent(panel.hotelId)}${qs.toString() ? `?${qs}` : ""}`;
    }
    case "event": {
      const { name, url, source, imageUrl, date, venue } = panel.seed;
      const qs = new URLSearchParams({ name, url, source });
      if (imageUrl) qs.set("img", imageUrl);
      if (date) qs.set("date", date);
      if (venue) qs.set("venue", venue);
      return `${base}/event?${qs}`;
    }
    case "collection":
    case "area":
      return `${base}/discover`;
    case "flight":
      return `${base}/transport`;
    case "day":
      return `${base}/itinerary`;
    case "budget":
      return `${base}/budget`;
    case "map":
    case "route":
      return `${base}/map`;
    case "weather":
      return base;
    case "checklist":
      return `${base}/bookings`;
    default:
      return `${base}/compare${compareIds.length ? `?ids=${compareIds.map(encodeURIComponent).join(",")}` : ""}`;
  }
}

/** The options the scratch chat should reason about — the compare set, or just the one thing on screen. */
export function chatItems(p: PanelState, compareList: CompareEntry[]) {
  if (p.kind === "compare") {
    return compareList.map((e) => ({
      name: e.name,
      detail: e.attrs.detail,
      price: e.attrs.price,
      rating: e.attrs.rating,
      when: e.attrs.when,
      address: e.attrs.address,
      lat: e.attrs.lat,
      lng: e.attrs.lng,
    }));
  }
  if (p.kind === "collection") return [];
  if (p.kind === "flight") return [{ name: panelTitle(p), detail: "Flight", price: `${p.flight.price} ${p.flight.currency}`, when: p.flight.departAt }];
  if (p.kind === "day") return [{ name: panelTitle(p), detail: `Itinerary day: ${p.block.days[p.dayIndex]?.stops.map((stop) => stop.title).join(", ")}` }];
  if (p.kind === "route") return [{ name: panelTitle(p), detail: `Ways to get there: ${p.routes.map((r) => `${r.mode} ${formatDuration(r.durationSeconds / 60)}`).join(", ")}` }];
  if (p.kind === "map") return [{ name: panelTitle(p), detail: `Map of: ${p.points.map((point) => point.name).join(", ")}` }];
  if (p.kind === "area") { const item = p.items[p.active]; return [{ name: panelTitle(p), detail: `${p.optionKind === "area" ? "Neighbourhood" : "Day trip"}: ${item?.blurb ?? ""} ${item?.tags.join(", ") ?? ""}`.trim() }]; }
  if (p.kind === "weather") return [{ name: panelTitle(p), detail: p.block.headline }];
  if (p.kind === "checklist") return [{ name: panelTitle(p), detail: `Checklist: ${p.block.groups.flatMap((g) => g.items.map((i) => i.text)).slice(0, 8).join(", ")}` }];
  if (p.kind === "budget") return [{ name: panelTitle(p), detail: `About ${p.block.dailyTotal.typical} ${p.block.currency} a day, ${p.block.perPerson ? "per person" : "for the group"}` }];
  return [{ name: panelTitle(p), detail: p.kind === "stay" ? "Hotel" : p.kind === "event" ? "Event" : "Place" }];
}
