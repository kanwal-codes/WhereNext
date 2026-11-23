import { matchesFilter, pickFeatured, sortForHome, tripCounts, tripStatus, type TripDates, type TripFilter } from "@/lib/trip-status";

const FILTER_TABS: Array<{ key: TripFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "undated", label: "Planning" },
];

/** What the home screen shows for a list of trips at `now` with the `filter` tab asked for. */
export function homeView<T extends TripDates & { id: string }>(list: T[], now: number, filter: TripFilter) {
  const counts = tripCounts(list, now);
  // Past trips are not a tab: they sit in their own section at the end of the page, folded away, and the rest is what is still ahead.
  const sorted = sortForHome(list, now);
  const past = sorted.filter((trip) => tripStatus(trip, now).phase === "past");
  const ahead = sorted.filter((trip) => tripStatus(trip, now).phase !== "past");
  // If the last trip of a kind is deleted while its tab is open, fall back to All rather than an empty tab.
  const activeFilter: TripFilter = filter !== "past" && counts[filter] > 0 ? filter : "all";
  const visible = ahead.filter((trip) => matchesFilter(tripStatus(trip, now), activeFilter));
  const featured = pickFeatured(visible, now);
  const rest = visible.filter((trip) => trip.id !== featured?.id);
  const tabs = FILTER_TABS.filter((tab) => tab.key === "all" || counts[tab.key] > 0);
  // Tabs earn their place only with more than a few trips of more than one kind.
  const showTabs = ahead.length > 3 && tabs.length > 2;
  return { counts: { ...counts, all: ahead.length }, activeFilter, visible, featured, rest, past, tabs, showTabs };
}
