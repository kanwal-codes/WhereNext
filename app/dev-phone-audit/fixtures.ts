// TEMPORARY, part of the phone redesign (docs/design/phone-redesign-plan.md): fixture replies for every Roam widget.
// No network. The local stack has no provider keys, so search-backed widgets (places, stays, flights, weather,
// routes, events) can only be checked from here. Delete with app/dev-phone-audit when the redesign has shipped.
import type { AssistantBlock } from "@/packages/contracts/assistant";

/** Fixture pictures that the contract wants as http(s) URLs live at this host; the audit page swaps it for its own origin. */
export const FIXTURE_ORIGIN = "https://fixtures.invalid";

export type Scene = { label: string; user: string; text: string; blocks?: AssistantBlock[] };

const place = (i: number, name: string, category: string, photo?: string) => ({
  provider: "google", providerId: `p${i}`, name, category, latitude: 51.5, longitude: -0.1, address: "London", sourceUrl: null,
  rating: 4.4 + (i % 5) / 10, userRatingCount: 1200 * (i + 1), photoUrl: photo, trust: "sourced" as const,
});

export const scenes: Scene[] = [
  { label: "1 Plain prose + markdown list + chips", user: "What should I know before going in October?", text: "October in London is **mild and damp**. A few things worth planning around:\n\n- Pack a light waterproof; showers are frequent.\n- Sunset is around 6pm, so plan outdoor stops earlier.\n- Book the Tower of London ahead for weekends.\n\nWant me to look at weather day by day?", blocks: [{ type: "actions", items: [{ label: "Weather by day", prompt: "x" }, { label: "Plan itinerary", prompt: "x" }, { label: "Where to stay", prompt: "x" }, { label: "Food ideas", prompt: "x" }] }] },
  { label: "2 Clarifying question + chips", user: "plan something fun", text: "Happy to. Who is coming along on this trip?", blocks: [{ type: "clarifying_question", question: "Who is coming?", chips: ["Just me", "Partner", "Friends", "Family with kids"] }] },
  { label: "3 Place list (titled, 6 places, 1 without photo)", user: "Best rooftop bars?", text: "Here are the rooftops that fit a group of four on a mid-range budget.", blocks: [{ type: "place_list", title: "rooftop bars", places: [place(1, "Sky Garden", "tourist_attraction", "/design/discover-rooftop.jpg"), place(2, "Carlotta", "restaurant", "/design/place-cafe.jpg"), place(3, "Fallow", "restaurant", "/design/discover-live-music.jpg"), place(4, "Bill's Soho with a deliberately long venue name", "restaurant"), place(5, "Extra One", "bar"), place(6, "Extra Two", "bar")] }] },
  { label: "4 Place list (untitled)", user: "somewhere for coffee", text: "A couple of options nearby.", blocks: [{ type: "place_list", places: [place(1, "Monmouth Coffee", "cafe", "/design/place-cafe.jpg"), place(2, "Prufrock", "cafe")] }] },
  { label: "5 Events (featured + list + relToTrip)", user: "Any concerts?", text: "Two big shows land inside your dates.", blocks: [{ type: "events", retrievedAt: "2026-09-30T00:00:00Z", window: { start: "2026-09-30", end: "2026-10-06" }, items: [
    { title: "Michel Rivard", url: "https://x/1", date: "2026-10-02", venue: "Eventim Apollo, London", source: "ticketmaster", imageUrl: "https://fixtures.invalid/design/place-concert-arena.jpg", relToTrip: "in", offsetDays: 0, rank: 70 },
    { title: "Kingston Chamber Concerts: Zemlinski Trio", url: "https://x/2", date: "2026-10-03", venue: "All Saints Church, Kingston upon Thames", source: "eventbrite", relToTrip: "in", offsetDays: 0 },
    { title: "SARASANDO by INALEAH - Indonesian Music Concert, Socials, & Snacks", url: "https://x/3", date: "2026-10-03", venue: "Green Place Studios", source: "eventbrite", relToTrip: "in", offsetDays: 0 },
    { title: "Just After", url: "https://x/4", date: "2026-10-09", venue: "Blue Note", source: "ticketmaster", relToTrip: "after", offsetDays: 3 },
  ] }] },
  { label: "6 Stays", user: "Where should we stay?", text: "Three well-reviewed stays near the sights.", blocks: [{ type: "stays", retrievedAt: "t", location: "London", checkin: "2026-10-01", checkout: "2026-10-04", nights: 3, dateNote: "Example dates 2026-10-01 → 2026-10-04 — set your real dates", items: [
    { hotelId: "h1", name: "The Hoxton, Holborn", nightlyPrice: "230", totalPrice: "690", currency: "GBP", stars: 4, rating: 9.1, reviews: 1200, board: "Breakfast", refundable: true, distanceToLocked: "400 m from the British Museum" },
    { hotelId: "h2", name: "citizenM Tower of London", nightlyPrice: "180", totalPrice: "540", currency: "GBP", stars: 4, rating: 8.8, reviews: 3400, refundable: false },
  ] }] },
  { label: "7 Flights", user: "flights from Toronto", text: "Nonstop options that fit your dates.", blocks: [{ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", dateNote: "Example date 2026-10-13 — no travel date set yet", items: [
    { airline: "Air Canada", price: "812.40", currency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" },
    { airline: "WestJet", price: "790.00", currency: "CAD", durationMinutes: 560, stops: 1, departAt: "2026-10-13T10:05:00", arriveAt: "2026-10-13T23:25:00" },
  ] }] },
  { label: "8 Weather (seasonal)", user: "weather in October?", text: "Typical October is cool and damp.", blocks: [{ type: "weather", retrievedAt: "t", location: "London", mode: "seasonal", month: "October", headline: "Cool and damp — bring layers", highC: 15, lowC: 9, condition: "clouds", rainyDays: 12, packing: ["Warm layer", "Waterproof shell", "Umbrella"], days: [] }] },
  { label: "9 Weather (forecast strip)", user: "forecast this week", text: "Mostly mild with one wet day.", blocks: [{ type: "weather", retrievedAt: "t", location: "London", mode: "forecast", headline: "Mild — a light jacket for evenings", packing: ["Light jacket"], days: [
    { label: "Wed", min: 10, max: 16, condition: "clear", wet: false }, { label: "Thu", min: 11, max: 15, condition: "rain", wet: true }, { label: "Fri", min: 9, max: 14, condition: "clouds", wet: false }, { label: "Sat", min: 8, max: 13, condition: "clear", wet: false }, { label: "Sun", min: 9, max: 14, condition: "rain", wet: true }, { label: "Mon", min: 9, max: 15, condition: "clouds", wet: false }, { label: "Tue", min: 10, max: 16, condition: "clear", wet: false },
  ] }] },
  { label: "10 Budget (fits)", user: "daily budget?", text: "Roughly this per person per day.", blocks: [{ type: "budget", currency: "GBP", perPerson: true, summary: "~120/day each.", lines: [{ category: "Food & drink", low: 30, typical: 55, high: 100, note: "casual spots" }, { category: "Local transit", low: 8, typical: 12, high: 20 }, { category: "Activities", low: 0, typical: 25, high: 60 }], dailyTotal: { low: 38, typical: 92, high: 180 }, setBudget: 150, tripNote: "excludes flights & hotel" }] },
  { label: "11 Budget (over)", user: "and on a tighter budget?", text: "That would be tight.", blocks: [{ type: "budget", currency: "GBP", perPerson: true, summary: "over budget", lines: [{ category: "Food", low: 40, typical: 90, high: 160 }, { category: "Fun", low: 20, typical: 60, high: 120 }], dailyTotal: { low: 60, typical: 150, high: 280 }, setBudget: 100 }] },
  { label: "12 Itinerary", user: "plan 3 days", text: "A first-timer's three days.", blocks: [{ type: "itinerary", title: "3 days in London", days: [
    { label: "Day 1", subtitle: "Westminster", stops: [{ time: "Morning", title: "Westminster Abbey", note: "Go early", placeId: "p1", kind: "sight" }, { time: "Afternoon", title: "St James's Park", note: "Coffee and a walk", placeId: "p2", kind: "activity" }, { time: "Evening", title: "Dinner in Soho", kind: "food" }] },
    { label: "Day 2", subtitle: "South Bank", stops: [{ time: "Morning", title: "Tate Modern", placeId: "p3", kind: "sight" }, { title: "Borough Market", note: "Lunch here", placeId: "p4", kind: "food" }] },
    { label: "Day 3", stops: [{ title: "Greenwich", kind: "activity" }] },
  ] }] },
  { label: "12b Itinerary (clock times, from the screenshot)", user: "1 day in Niagara Falls", text: "", blocks: [{ type: "itinerary", title: "1 day in Niagara Falls", days: [
    { label: "Day 1", subtitle: "Falls, Food & Views", stops: [{ time: "08:30", title: "Flying Saucer Restaurant", note: "Classic diner near Clifton Hill, good for a quick breakfast.", placeId: "p1", kind: "food" }, { time: "09:30", title: "Journey Behind the Falls", note: "Descend to tunnels for close-up views of the Horseshoe Falls.", placeId: "p2", kind: "sight" }, { time: "12:30", title: "Table Rock House Restaurant", placeId: "p3", kind: "food" }] },
  ] }] },
  { label: "13 Route (single)", user: "how do we get from the airport?", text: "The Elizabeth line is quickest.", blocks: [{ type: "route_summary", from: "Heathrow", to: "Hotel", mode: "transit", durationSeconds: 3000, distanceMeters: 24000, steps: ["TRANSIT Elizabeth line → Liverpool Street (35 min)", "WALK to hotel (8 min)"], retrievedAt: "t" }] },
  { label: "13b Route (Montreal, from the screenshot)", user: "how do I get to Jean Talon?", text: "The subway is easiest.", blocks: [{ type: "route_summary", from: "Hôtel Saint‑Laurent, Montreal, Canada", to: "Jean Talon Market, Montreal, Canada", mode: "transit", durationSeconds: 1560, distanceMeters: 6400, fare: { amount: 3.75, currency: "CAD" }, departureTime: "2026-11-26T14:05:00", steps: ["Walk 6 min", "subway 2 → Jean-Talon (14 min)", "Walk 6 min"], retrievedAt: "t" }] },
  { label: "14 Route comparison", user: "drive or transit to Belém?", text: "Compared below.", blocks: [{ type: "route_summary", from: "Hotel", to: "Greenwich", mode: "driving", durationSeconds: 1500, distanceMeters: 12000, steps: [], retrievedAt: "t" }, { type: "route_summary", from: "Hotel", to: "Greenwich", mode: "transit", durationSeconds: 2400, distanceMeters: 13000, steps: [], retrievedAt: "t" }, { type: "route_summary", from: "Hotel", to: "Greenwich", mode: "walking", durationSeconds: 8400, distanceMeters: 11000, steps: [], retrievedAt: "t" }] },
  { label: "15 Checklist", user: "what to pack?", text: "Grouped for you.", blocks: [{ type: "checklist", groups: [{ title: "Packing", items: [{ text: "Rain shell", why: "showers likely" }, { text: "Adapter (UK plug)" }] }, { title: "Before you go", items: [{ text: "Book Tower of London", why: "sells out on weekends" }] }] }] },
  { label: "16 Structured answer", user: "how does transit work?", text: "", blocks: [{ type: "structured_answer", intro: "Tube and buses use contactless.", sections: [{ heading: "Fares", bullets: [{ text: "Single ride", detail: "£2.80" }, { text: "Daily cap", detail: "£8.50" }] }, { heading: "Hours", bullets: [{ text: "Roughly 5:30am to 12:30am" }] }] }] },
  { label: "17 Options (areas)", user: "which area?", text: "", blocks: [{ type: "options", kind: "area", intro: "Base yourself in one of these.", items: [{ name: "Shoreditch", blurb: "Street art, bars and late-night food.", tags: ["nightlife", "walkable"], meta: "east · lively", bestFor: "friends who like going out" }, { name: "Bloomsbury", blurb: "Quiet squares near the museums.", tags: ["central"] }] }] },
  { label: "18 Comparison (static)", user: "Alfama vs Bairro Alto", text: "", blocks: [{ type: "comparison", title: "Alfama vs Bairro Alto", columns: ["Option", "Vibe", "Cost"], rows: [{ label: "Alfama", cells: ["Alfama", "quiet", "€€"] }, { label: "Bairro Alto", cells: ["Bairro Alto", "lively", "€€"] }], bestForYou: { label: "Alfama", reason: "quieter for a couple who dislike crowds" } }] },
  { label: "19 Trip update receipt", user: "we go Sep 30 to Oct 6", text: "Done — dates updated.", blocks: [{ type: "trip_update", changes: [{ field: "dates", label: "Dates", from: "undecided", to: "2026-09-30 to 2026-10-06", undoPrompt: "undo" }, { field: "destination", label: "Destination", from: "not set", to: "London, England, United Kingdom" }] }] },
];

/** Edge cases the widgets must hold under: long names, a missing photo, one item, no data. */
export const edgeScenes: Scene[] = [
  { label: "E1 Place list, one place, no photo", user: "one coffee spot", text: "Just the one.", blocks: [{ type: "place_list", places: [place(1, "A café whose name is long enough to need two lines on a phone", "cafe")] }] },
  { label: "E2 Stays, one stay, no price", user: "any stay?", text: "One option.", blocks: [{ type: "stays", retrievedAt: "t", location: "London", checkin: "2026-10-01", checkout: "2026-10-04", nights: 3, items: [{ hotelId: "h9", name: "A boutique hotel with a very long name near the river and the market", nightlyPrice: "", totalPrice: "", currency: "GBP", stars: 3, rating: 8.2, reviews: 90, refundable: false }] }] },
  { label: "E3 Flights, one offer", user: "one flight", text: "The only one.", blocks: [{ type: "flights", retrievedAt: "t", origin: "Toronto", destination: "London", items: [{ id: "a", airline: "Air Canada", price: "812.40", currency: "CAD", durationMinutes: 491, stops: 0, departAt: "2026-10-13T18:20:00", arriveAt: "2026-10-14T06:31:00" }] }] },
  { label: "E4 Checklist, empty group", user: "what to pack?", text: "Nothing yet.", blocks: [{ type: "checklist", groups: [{ title: "Packing", items: [{ text: "Passport" }] }] }] },
];

