import { BedDouble, Landmark, ShoppingBag, Ticket, TreePine, Utensils, Waves, Wine, type LucideIcon } from "lucide-react";

export type DiscoverKind = "place" | "event" | "stay";
export type SubChip = { label: string; q: string };
export type DiscoverCategory = {
  key: string;
  label: string;
  kind: DiscoverKind;
  icon: LucideIcon;
  /** The query run when the category is picked with no sub-chip. */
  q: string;
  subs: SubChip[];
};

/**
 * Tier-1 categories for Discover, each with the finer sub-types (Tier-2).
 * `q` strings are passed to the place/event search verbatim (then destination-scoped);
 * for `kind: "stay"` the sub `q` is a price band 1–4.
 */
export const CATEGORIES: DiscoverCategory[] = [
  {
    key: "eat",
    label: "Eat & Drink",
    kind: "place",
    icon: Utensils,
    // Not "well-reviewed restaurants and cafes": with that wording Google matched business names ("cafe in Brampton") and answered from wherever the server is, for any city.
    q: "restaurants and cafes",
    subs: [
      { label: "Restaurants", q: "restaurants" },
      { label: "Cafés", q: "cafes" },
      { label: "Brunch", q: "brunch spots" },
      { label: "Street food", q: "street food" },
      { label: "Bakeries", q: "bakeries" },
      { label: "Fine dining", q: "fine dining restaurants" },
      { label: "Veg / Vegan", q: "vegetarian and vegan restaurants" },
      { label: "Bars", q: "bars" },
    ],
  },
  {
    key: "nightlife",
    label: "Nightlife",
    kind: "place",
    icon: Wine,
    q: "nightlife bars and clubs",
    subs: [
      { label: "Clubs", q: "nightclubs" },
      { label: "Live music", q: "live music venues" },
      { label: "Cocktail bars", q: "cocktail bars" },
      { label: "Late-night eats", q: "late night food" },
      { label: "Comedy", q: "comedy clubs" },
      { label: "Rooftops", q: "rooftop bars" },
    ],
  },
  {
    key: "sights",
    label: "Sights",
    kind: "place",
    icon: Landmark,
    q: "top sights and landmarks",
    subs: [
      { label: "Landmarks", q: "landmarks" },
      { label: "Temples & worship", q: "temples" },
      { label: "Museums", q: "museums" },
      { label: "Historic", q: "historic sites" },
      { label: "Viewpoints", q: "viewpoints" },
      { label: "Architecture", q: "notable architecture" },
    ],
  },
  {
    key: "outdoors",
    label: "Nature & Outdoors",
    kind: "place",
    icon: TreePine,
    q: "parks and nature spots",
    subs: [
      { label: "Parks", q: "parks" },
      { label: "Hikes & trails", q: "hiking trails" },
      { label: "Beaches", q: "beaches" },
      { label: "Gardens", q: "botanical gardens" },
      { label: "Lakes & waterfalls", q: "lakes and waterfalls" },
      { label: "Scenic drives", q: "scenic drives" },
    ],
  },
  {
    key: "activities",
    label: "Activities",
    kind: "place",
    icon: Waves,
    q: "things to do and activities",
    subs: [
      { label: "Tours", q: "guided tours" },
      { label: "Water sports", q: "boating kayaking and water sports" },
      { label: "Adventure", q: "bungee jumping zipline and paragliding" },
      { label: "Classes & workshops", q: "classes and workshops" },
      { label: "Wellness & spa", q: "spa and wellness" },
      { label: "Cycling", q: "bike rentals and cycling tours" },
    ],
  },
  {
    key: "events",
    label: "Culture & Events",
    kind: "event",
    icon: Ticket,
    q: "",
    subs: [
      { label: "Concerts", q: "concert" },
      { label: "Sports", q: "sports" },
      { label: "Theatre & arts", q: "theatre" },
      { label: "Festivals", q: "festival" },
      { label: "Markets & fairs", q: "market fair" },
      { label: "Film", q: "film screening" },
    ],
  },
  {
    key: "shopping",
    label: "Shopping",
    kind: "place",
    icon: ShoppingBag,
    q: "markets and shopping",
    subs: [
      { label: "Markets & bazaars", q: "markets and bazaars" },
      { label: "Malls", q: "shopping malls" },
      { label: "Boutiques", q: "boutiques" },
      { label: "Bookshops", q: "bookshops" },
      { label: "Souvenirs", q: "souvenir shops" },
      { label: "Craft & design", q: "craft and design shops" },
    ],
  },
  {
    key: "stays",
    label: "Stays",
    kind: "stay",
    icon: BedDouble,
    q: "",
    subs: [
      { label: "$", q: "1" },
      { label: "$$", q: "2" },
      { label: "$$$", q: "3" },
      { label: "$$$$", q: "4" },
    ],
  },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Rough keyword → category for auto-selecting a Tier-1 chip from a free-text search. */
const KEYWORDS: Array<[RegExp, string]> = [
  [/\b(restaurant|food|eat|cafe|coffee|brunch|dinner|lunch|bakery|bar|vegan|vegetarian)\b/i, "eat"],
  [/\b(club|nightlife|party|cocktail|rooftop|comedy)\b/i, "nightlife"],
  [/\b(temple|church|mosque|gurdwara|museum|landmark|monument|palace|fort|cathedral|shrine|architecture|historic)\b/i, "sights"],
  [/\b(park|hike|hiking|trail|beach|garden|lake|waterfall|nature|mountain|forest)\b/i, "outdoors"],
  [/\b(tour|kayak\w*|boat\w*|bungee|zip\s?line|paraglid\w*|raft\w*|scuba|diving|snorkel\w*|spa|cycling|workshop|class)\b/i, "activities"],
  [/\b(concert|festival|gig|match|game|show|theatre|theater|exhibition)\b/i, "events"],
  [/\b(hotel|hostel|stay|accommodation|airbnb|apartment|resort)\b/i, "stays"],
  [/\b(shop|market|bazaar|mall|boutique|bookshop|souvenir)\b/i, "shopping"],
];

export function categoryForQuery(query: string): string | null {
  for (const [re, key] of KEYWORDS) if (re.test(query)) return key;
  return null;
}

/** A one-word badge for a Google `primaryType`, so a blended feed still reads at a glance. */
export function coarseKind(primaryType: string | null | undefined): string {
  const t = (primaryType ?? "").toLowerCase();
  if (/restaurant|cafe|coffee|bakery|bar|food|meal_|pub|bistro/.test(t)) return "Eat";
  if (/night_club|club/.test(t)) return "Nightlife";
  if (/museum|gallery|temple|church|mosque|synagogue|shrine|hindu|historical|monument|landmark|tourist_attraction|place_of_worship/.test(t)) return "Sight";
  if (/park|garden|beach|hiking|trail|natural|mountain|forest|campground|national_park/.test(t)) return "Nature";
  if (/store|shop|market|mall|boutique|book/.test(t)) return "Shopping";
  if (/lodging|hotel|hostel|resort|guest_house/.test(t)) return "Stay";
  if (/tour|travel_agency|amusement|adventure|sports|gym|spa|bowling|climbing/.test(t)) return "Do";
  return "Place";
}
