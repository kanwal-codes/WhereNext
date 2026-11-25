// A clean, believable demo account for the phone renders. LOCAL stack only (refuses anything else).
//   PHONE_KEYS_FILE=keys.json PHONE_RENDER_PASSWORD=… node scripts/phone-render-seed.mjs
// Signs in as render@wherenext.test (create it first through the local auth admin API), then builds three trips through the app's own API
// (real Google places and cover photos, so run the dev server with scripts/dev-phone.sh and PHONE_PROVIDER_KEYS including GOOGLE_MAPS_API_KEY),
// and writes the chat history straight into the local database. Re-runnable: the hero trip's chat rows are cleared and rewritten.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.PHONE_BASE ?? "http://localhost:4000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const local = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u);
if (!local(BASE) || !local(SB)) { console.error("Refusing: local stack only."); process.exit(1); }
const keys = JSON.parse(readFileSync(process.env.PHONE_KEYS_FILE ?? "", "utf8"));
const EMAIL = "render@wherenext.test";

const sql = (text) => execFileSync("docker", ["exec", "-i", "supabase_db_sb", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-q"], { input: text, encoding: "utf8" }).trim();
const lit = (v) => `$q$${typeof v === "string" ? v : JSON.stringify(v)}$q$`;

// ---- sign in (same cookie the app's own login sets)
const login = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: keys.anon, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: process.env.PHONE_RENDER_PASSWORD }) });
if (!login.ok) { console.error("sign-in failed", login.status); process.exit(1); }
const session = await login.json();
const me = session.user.id;
const val = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const parts = []; for (let i = 0; i < val.length; i += 3180) parts.push(val.slice(i, i + 3180));
const cookie = parts.length === 1 ? `sb-127-auth-token=${val}` : parts.map((p, i) => `sb-127-auth-token.${i}=${p}`).join("; ");
const H = { cookie, origin: BASE, "content-type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  return json;
};

// ---- trips
const TRIPS = [
  { key: "montreal", body: { name: "Montreal long weekend", destination: "Montreal, Canada", origin: "Toronto, Canada", startDate: "2026-11-26", endDate: "2026-11-29", travelerCount: 3, preferences: { interests: ["food", "markets", "art"], budget: 180, pace: "moderate", groupType: "friends" } }, cover: "Montreal, Canada" },
  { key: "tokyo", body: { name: "Tokyo in spring", destination: "Tokyo, Japan", origin: "Toronto, Canada", startDate: "2027-03-20", endDate: "2027-03-27", travelerCount: 2, preferences: { interests: ["food", "temples", "design"], budget: 220, pace: "relaxed", groupType: "couple" } }, cover: "Tokyo, Japan" },
  { key: "lisbon", body: { name: "Lisbon and Porto", destination: "Lisbon, Portugal", origin: "Toronto, Canada", startDate: "2027-05-08", endDate: "2027-05-14", travelerCount: 2, preferences: { interests: ["food", "tiles", "views"], budget: 160, pace: "moderate", groupType: "couple" } }, cover: "Lisbon, Portugal" },
];
const trip = {};
for (const t of TRIPS) {
  const made = await api("POST", "/api/trips", { ...t.body, idempotencyKey: `render-seed-${t.key}-1` });
  trip[t.key] = made.trip.id;
  const cover = await api("GET", `/api/trips/${trip[t.key]}/cover?destination=${encodeURIComponent(t.cover)}`);
  if (cover.photoName) sql(`update trips set hero_photo_name=${lit(cover.photoName)} where id='${trip[t.key]}'`);
  console.log(`trip ${t.key}: ${trip[t.key]} (cover ${cover.photoName ? "yes" : "none"})`);
}
const T = trip.montreal;

// ---- places (real Google data through the app)
const near = "45.5017,-73.5673";
const place = {};
async function find(name, tripId = T, at = near) {
  const key = `${tripId}:${name}`;
  if (place[key]) return place[key];
  const found = await api("GET", `/api/trips/${tripId}/places/google/autocomplete?query=${encodeURIComponent(name)}&scope=places&near=${at}`);
  const id = found.suggestions?.[0]?.placeId;
  if (!id) throw new Error(`no place for ${name}`);
  const d = (await api("GET", `/api/trips/${tripId}/places/google?placeId=${encodeURIComponent(id)}`)).place;
  return (place[key] = { id, name: d.displayName?.text ?? name, address: d.formattedAddress ?? "", lat: d.location?.latitude, lng: d.location?.longitude, rating: d.rating, count: d.userRatingCount, photo: d.photos?.[0]?.name ?? null, types: d.types ?? [], summary: d.editorialSummary?.text ?? null });
}
const photoUrl = (tripId, p, w = 800) => (p.photo ? `/api/trips/${tripId}/places/google/photo?name=${encodeURIComponent(p.photo)}&w=${w}` : null);

// ---- the hero trip's plan: real stops, three planned days and a fourth left open
const PLAN = [
  { day: 1, subtitle: "Old Montreal", stops: [
    { time: "15:00", title: "Check in at Hôtel Place d'Armes", q: "Hôtel Place d'Armes", kind: "rest", locked: true, note: "Dump the bags, then wander out." },
    { time: "17:30", title: "Walk the Old Port", q: "Old Port of Montreal", kind: "sight", note: "Cobbled streets and the river at dusk." },
    { time: "19:30", title: "Dinner at Joe Beef", q: "Joe Beef Montreal", kind: "food", note: "The one everyone says to book." },
  ] },
  { day: 2, subtitle: "Food and art", stops: [
    { time: "10:30", title: "Brunch at Olive et Gourmando", q: "Olive et Gourmando", kind: "food", note: "Get there before the queue." },
    { time: "12:30", title: "Notre-Dame Basilica", q: "Notre-Dame Basilica of Montreal", kind: "sight", note: "Deep blue, gold stars, worth the line." },
    { time: "15:00", title: "Montreal Museum of Fine Arts", q: "Montreal Museum of Fine Arts", kind: "sight", note: "Two hours is plenty." },
    { time: "19:00", title: "Smoked meat at Schwartz's", q: "Schwartz's Montreal Hebrew Delicatessen", kind: "food", note: "Order it medium, with a pickle." },
  ] },
  { day: 3, subtitle: "Markets and Mile End", stops: [
    { time: "09:30", title: "Mount Royal lookout", q: "Kondiaronk Belvedere Mount Royal", kind: "sight", note: "Best light in the morning." },
    { time: "12:00", title: "Jean-Talon Market", q: "Jean-Talon Market", kind: "food", note: "Graze, then pick up gifts." },
    { time: "15:00", title: "Bagels at St-Viateur", q: "St-Viateur Bagel Mile End", kind: "food", note: "Still warm from the wood oven." },
    { time: "20:30", title: "Pints at Dieu du Ciel!", q: "Dieu du Ciel! Brasserie Montreal", kind: "nightlife", note: "A proper local brewpub." },
  ] },
];
for (const d of PLAN) for (const s of d.stops) s.p = await find(s.q);
for (const d of PLAN) for (const s of d.stops) {
  await api("POST", `/api/trips/${T}/itinerary`, { title: s.title, providerId: s.p.id, dayIndex: d.day, time: s.time, ...(s.locked ? { locked: true } : {}) });
}
console.log("itinerary: 10 stops over 3 days");

// saved places
for (const n of ["Café Olimpico Montreal", "La Banquise Montreal", "Marché Atwater", "Parc La Fontaine", "Biscuiterie Mile End"]) {
  const p = await find(n);
  await api("POST", `/api/trips/${T}/places`, { provider: "google", providerId: p.id, name: p.name, category: p.types.includes("restaurant") || p.types.includes("cafe") ? "restaurant" : "tourist_attraction", latitude: p.lat, longitude: p.lng, address: p.address || null, sourceUrl: null, ...(p.rating ? { rating: p.rating } : {}), ...(p.count ? { userRatingCount: p.count } : {}), ...(p.photo ? { photoNames: [p.photo] } : {}) });
}
console.log("saved places: 5");

// the stay, locked
const hotel = PLAN[0].stops[0].p;
await api("POST", `/api/trips/${T}/decisions`, { kind: "stay", value: {
  provider: "serpapi", hotelId: "g:hotel-place-darmes", hotelName: "Hôtel Place d'Armes", roomName: "Deluxe King, city view", board: "Breakfast included", refundable: true,
  checkin: "2026-11-26", checkout: "2026-11-29", nights: 3, nightlyAmount: 289, totalAmount: 867, currency: "CAD", latitude: hotel.lat ?? null, longitude: hotel.lng ?? null,
  address: hotel.address || "55 Rue Saint-Jacques, Montréal, QC", thumbnail: hotel.photo ? `${BASE}${photoUrl(T, hotel, 640)}` : null,
} });

// bookings
const RES = [
  { kind: "flight", title: "WestJet WS 612", startsOn: "2026-11-26", startTime: "07:10", endTime: "08:28", place: "Toronto Pearson (YYZ)", toPlace: "Montréal-Trudeau (YUL)", confirmationCode: "QX7R4M", amount: 164, currency: "CAD", amountBasis: "per_person", travellers: 3 },
  { kind: "stay", title: "Hôtel Place d'Armes", startsOn: "2026-11-26", endsOn: "2026-11-29", startTime: "15:00", endTime: "11:00", place: "55 Rue Saint-Jacques, Montréal", confirmationCode: "HPA-55821", amount: 867, currency: "CAD", amountBasis: "total", travellers: 3 },
  { kind: "dining", title: "Dinner at Joe Beef", startsOn: "2026-11-26", startTime: "19:30", place: "Little Burgundy, Montréal", confirmationCode: "JB-3-1930", amount: null, travellers: 3 },
  { kind: "activity", title: "Montreal Museum of Fine Arts", startsOn: "2026-11-27", startTime: "15:00", place: "1380 Rue Sherbrooke O, Montréal", confirmationCode: "MBAM-77412", amount: 22, currency: "CAD", amountBasis: "per_person", travellers: 3 },
];
for (const r of RES) await api("POST", `/api/trips/${T}/reservations`, r);
console.log("bookings: 4, stay locked");

// a little more on the other trips so All trips and their overviews are not empty
const TOKYO = [["Senso-ji Temple", 1, "09:00"], ["Tsukiji Outer Market", 1, "11:30"], ["Shibuya Crossing", 2, "17:30"]];
for (const [q, day, time] of TOKYO) {
  const p = await find(q, trip.tokyo, "35.6762,139.6503");
  await api("POST", `/api/trips/${trip.tokyo}/itinerary`, { title: q, providerId: p.id, dayIndex: day, time });
}

// ---- friends in the group chat
const friend = (name) => sql(`select id from auth.users where email='${name}@wherenext.test'`);
const maya = friend("maya"), noah = friend("noah");
if (!maya || !noah) throw new Error("maya/noah test users are missing");
sql(`insert into trip_members (trip_id,user_id,role) values ('${T}','${maya}','editor'),('${T}','${noah}','editor') on conflict do nothing`);
sql(`delete from group_messages where trip_id='${T}'`);
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const GROUP = [
  [maya, "user", 410, "Okay, found a flight on the 26th. WestJet, 7:10am, $164 each. Anyone else on that?"],
  [noah, "user", 392, "7am is brutal but it's cheap. I'm in."],
  [me, "user", 380, "In. I'll book once we agree on the hotel."],
  [maya, "user", 351, "Hôtel Place d'Armes looks perfect. Right by the Old Port."],
  [noah, "user", 330, "Brunch at Olive et Gourmando on Friday? Please."],
  [me, "user", 296, "@Roam where should we eat Friday night? Nothing too fancy"],
  [me, "assistant", 295, "**Joe Beef** is the classic Montreal answer: relaxed, loud in a good way, and the kind of place you talk about for weeks. Book ahead, it fills up early. If it's full, **Bouillon Bilk** is a calmer second."],
  [maya, "user", 270, "Joe Beef!! Saving that."],
  [noah, "user", 241, "Schwartz's for lunch on Saturday, no debate."],
  [maya, "user", 118, "Pottery in Mile End on Sunday morning? I found a drop-in class."],
  [noah, "user", 96, "Mount Royal at sunset on Sunday, then?"],
  [maya, "user", 12, "Booking the museum tickets tonight, will drop the confirmation in here."],
];
for (const [uid, role, min, content] of GROUP) {
  sql(`insert into group_messages (id,trip_id,user_id,role,kind,content,metadata,created_at) values ('${randomUUID()}','${T}','${uid}','${role}','text',${lit(content)},'{}'::jsonb,'${ago(min)}')`);
}
console.log("group chat: 12 messages");

// ---- the Roam conversation, with real places
const dinner = await Promise.all(["Joe Beef Montreal", "Bouillon Bilk", "Le Vin Papillon", "Toqué! Restaurant Montreal"].map((n) => find(n)));
const placeCard = (p) => ({ provider: "google", providerId: p.id, name: p.name, category: p.types.includes("restaurant") ? "restaurant" : "tourist_attraction", latitude: p.lat, longitude: p.lng, address: (p.address || "Montréal").split(",").slice(0, 2).join(","), sourceUrl: null, rating: p.rating, userRatingCount: p.count, photoUrl: photoUrl(T, p, 640), trust: "sourced" });
const stop = (s) => ({ time: s.time, title: s.title, note: s.note, placeId: s.p.id, kind: s.kind });
const itinerary = { type: "itinerary", title: "4 days in Montreal", days: PLAN.map((d) => ({ label: `Day ${d.day}`, subtitle: d.subtitle, stops: d.stops.map(stop) })) };
const flight = (id, airline, price, mins, dep, arr) => ({ id, airline, price: String(price), currency: "CAD", durationMinutes: mins, stops: 0, departAt: `2026-11-26T${dep}:00`, arriveAt: `2026-11-26T${arr}:00`, originAirport: "YYZ", destinationAirport: "YUL" });
const flights = { type: "flights", retrievedAt: new Date().toISOString(), origin: "Toronto", destination: "Montréal", dateNote: "Departing 2026-11-26", departureDate: "2026-11-26", insights: { level: "low", lowest: 164, typicalLow: 175, typicalHigh: 260 },
  items: [flight("fx:ws612", "WestJet", 164, 78, "07:10", "08:28"), flight("fx:ac8700", "Air Canada", 201, 82, "06:00", "07:22"), flight("fx:pd2014", "Porter", 188, 84, "08:30", "09:54"), flight("fx:ac8706", "Air Canada", 219, 85, "10:15", "11:40")] };
const weather = { type: "weather", retrievedAt: new Date().toISOString(), location: "Montreal", mode: "forecast", headline: "Cold and bright: pack a proper coat", packing: ["Warm coat", "Gloves", "Waterproof boots"],
  days: [{ label: "Thu", min: -2, max: 4, condition: "clear", wet: false }, { label: "Fri", min: -1, max: 3, condition: "clouds", wet: false }, { label: "Sat", min: -3, max: 1, condition: "snow", wet: true }, { label: "Sun", min: -4, max: 2, condition: "clear", wet: false }] };
const budget = { type: "budget", currency: "CAD", perPerson: true, summary: "About $150 a day each, with the museum and a big dinner.", setBudget: 180, tripNote: "Excludes flights and the hotel.",
  lines: [{ category: "Food & drink", low: 45, typical: 80, high: 140, note: "markets, brunch, one big dinner" }, { category: "Local transit", low: 4, typical: 9, high: 18, note: "metro day pass" }, { category: "Sights & tickets", low: 0, typical: 22, high: 40 }, { category: "Going out", low: 10, typical: 28, high: 60 }], dailyTotal: { low: 59, typical: 139, high: 258 } };
const meta = (blocks, followups = []) => ({ language: "en", locationFocus: "Montreal, Canada", surface: "chat", blocks, sources: [], suggestedFollowups: followups, unavailableProviders: [] });
const CHAT = [
  [2720, "user", "Plan us a long weekend in Montreal. We're three friends who love food, markets and art.", null],
  [2719, "assistant", "Here's a relaxed first draft built around food and the neighbourhoods. Day 4 is left open for whatever you fall for.", meta([itinerary], [{ label: "Fill day 4", prompt: "Fill day 4 of the trip" }, { label: "Where to eat Friday", prompt: "Where should we eat on Friday night?" }])],
  [1480, "user", "Where should we eat on Friday night? Nothing too fancy.", null],
  [1479, "assistant", "These are the dinner spots that fit three friends without a dress code. Joe Beef is the one to book first.", meta([{ type: "place_list", title: "dinner spots", places: dinner.map(placeCard) }])],
  [620, "user", "flights from Toronto on the 26th", null],
  [619, "assistant", "WestJet's 7:10 is the cheapest and the quickest, and the price is low for this route.", meta([flights], [{ label: "Compare the others", prompt: "Compare the other flights" }])],
  [300, "user", "what's the weather like that weekend?", null],
  [299, "assistant", "Cold but bright, with a little snow on Saturday.", meta([weather])],
  [140, "user", "how much should we budget per day?", null],
  [139, "assistant", "Roughly this per person per day.", meta([budget], [{ label: "Fill day 4", prompt: "Fill day 4 of the trip" }])],
];
const thread = randomUUID();
sql(`delete from conversation_messages where trip_id='${T}' and thread_id in (select id from conversation_threads where trip_id='${T}' and user_id='${me}')`);
sql(`delete from conversation_threads where trip_id='${T}' and user_id='${me}'`);
sql(`insert into conversation_threads (id,trip_id,user_id) values ('${thread}','${T}','${me}')`);
let n = 0;
for (const [min, role, content, metadata] of CHAT) {
  sql(`insert into conversation_messages (id,thread_id,trip_id,role,content,metadata,idempotency_key,created_at) values ('${randomUUID()}','${thread}','${T}','${role}',${lit(content)},${lit(metadata ?? {})}::jsonb,'render-seed-${n += 1}','${ago(min)}')`);
}
console.log("roam conversation: 10 messages");
console.log(JSON.stringify({ trips: trip }));
