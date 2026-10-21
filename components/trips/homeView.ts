import { matchesFilter, pickFeatured, sortForHome, tripCounts, tripStatus, type TripDates, type TripFilter } from "@/lib/trip-status";

const FILTER_TABS: Array<{ key: TripFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "undated", label: "Planning" },
  { key: "past", label: "Past" },
];

/** What the home screen shows for a list of trips at `now` with the `filter` tab asked for. */
export function homeView<T extends TripDates & { id: string }>(list: T[], now: number, filter: TripFilter) {
  const counts = tripCounts(list, now);
  // If the last trip of a kind is deleted while its tab is open, fall back to All rather than an empty tab.
  const activeFilter: TripFilter = counts[filter] > 0 ? filter : "all";
  const visible = sortForHome(list, now).filter((trip) => matchesFilter(tripStatus(trip, now), activeFilter));
  const featured = pickFeatured(visible, now);
  const rest = visible.filter((trip) => trip.id !== featured?.id);
  const tabs = FILTER_TABS.filter((tab) => tab.key === "all" || counts[tab.key] > 0);
  // Tabs earn their place only with more than a few trips of more than one kind.
  const showTabs = list.length > 3 && tabs.length > 2;
  return { counts, activeFilter, visible, featured, rest, tabs, showTabs };
}
