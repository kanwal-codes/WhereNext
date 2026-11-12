// Phone renders of every Roam chat widget: in the chat, and the sheet it opens when tapped (viewport and full length).
//   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/phone-widget-renders.mjs [light|dark|both] [sceneId ...]
// Needs the harness dev server (scripts/dev-phone.sh, :4000) and app/dev-phone-audit/live. Provider calls are answered here with fixtures,
// so nothing leaves the machine. Output: docs/design/widget-renders/<theme>/<widget>.png + manifest.json (gallery.html is built from it).
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildDocument, makeRegistry, snapshot } from "./phone-widget-html.mjs";

const base = process.env.PHONE_BASE ?? "http://localhost:4000";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)) { console.error("Refusing: local server only."); process.exit(1); }
const [themeArg = "light", ...only] = process.argv.slice(2);
const themes = themeArg === "both" ? ["light", "dark"] : [themeArg];
const out = "docs/design/widget-renders";
const MAPBOX = process.env.MAPBOX_ACCESS_TOKEN ?? (readFileSync(".env.local", "utf8").match(/^MAPBOX_ACCESS_TOKEN="?([^"\n]+)/m) ?? [])[1];

// scene: the fixture scene id. inline: how the widget looks in the chat (always taken). taps: controls that open a sheet or change the card.
const WIDGETS = [
  { scene: "1", name: "prose-chips", title: "Reply text and suggestion chips" },
  { scene: "2", name: "clarifying-question", title: "Clarifying question" },
  { scene: "3", name: "place-list", title: "Places", taps: [
    { name: "place-sheet", label: "Open Sky Garden", kind: "sheet", title: "Place (tap a card)" },
    { name: "see-all-sheet", label: "See all Rooftop bars", kind: "sheet", title: "See all places" },
    { name: "map-sheet", label: "Map", kind: "sheet", wait: 6000, title: "Places on the map" },
    { name: "add-to-day", label: "Choose an itinerary day for Sky Garden", kind: "popover", title: "Add to a day" },
  ] },
  { scene: "4", name: "place-list-small", title: "Places (two, no heading)" },
  { scene: "5", name: "events", title: "Events", taps: [{ name: "event-sheet", label: "Open Michel Rivard", kind: "sheet", title: "Event (tap a card)" }] },
  { scene: "6", name: "stays", title: "Stays", taps: [
    { name: "stay-sheet", label: "Open The Hoxton, Holborn", kind: "sheet", title: "Stay (tap a card)" },
    { name: "edit-dates", label: /nights/, kind: "inline", title: "Edit dates, in the card" },
  ] },
  { scene: "7", name: "flights", title: "Flights", taps: [
    { name: "edit-search", label: /Edit search/, kind: "inline", title: "Edit search, in the card" },
  ] },
  { scene: "7b", name: "flights-dated", title: "Flights, dated search", taps: [
    { name: "see-all", label: /^See all \d+ flights/, kind: "inline", title: "See all flights, in the card" },
    { name: "flight-sheet", css: '[aria-label^="Open details for"]', label: "a flight row", kind: "sheet", title: "Flight (tap a row)" },
  ] },
  { scene: "8", name: "weather-seasonal", title: "Weather, typical month", taps: [{ name: "weather-sheet", label: "See the week", kind: "sheet", title: "Weather (tap)" }] },
  { scene: "9", name: "weather-forecast", title: "Weather, 7-day forecast", taps: [{ name: "weather-sheet", label: "See the week", kind: "sheet", title: "Weather (tap)" }] },
  { scene: "10", name: "budget-fits", title: "Budget, within your limit", taps: [{ name: "budget-sheet", label: "Budget details", kind: "sheet", title: "Budget (tap)" }] },
  { scene: "11", name: "budget-over", title: "Budget, over your limit", taps: [{ name: "budget-sheet", label: "Budget details", kind: "sheet", title: "Budget (tap)" }] },
  { scene: "12", name: "itinerary", title: "Itinerary", taps: [
    { name: "day-sheet", label: "Open Day 1", kind: "sheet", title: "Day (tap)" },
    { name: "map-sheet", label: "Map", kind: "sheet", title: "Itinerary on the map", first: true, wait: 6000 },
  ] },
  { scene: "12b", name: "itinerary-clock-times", title: "Itinerary, clock times" },
  { scene: "13", name: "route", title: "Route", taps: [{ name: "route-sheet", label: "Directions", kind: "sheet", title: "Route (tap Directions)" }] },
  { scene: "13b", name: "route-transit-fare", title: "Route, transit with fare" },
  { scene: "14", name: "route-compare", title: "Routes compared", taps: [{ name: "route-sheet", label: "Directions", kind: "sheet", title: "Routes (tap Directions)" }] },
  { scene: "15", name: "checklist", title: "Checklist", taps: [{ name: "checklist-sheet", label: "Open list", kind: "sheet", title: "Checklist (tap)" }] },
  { scene: "16", name: "structured-answer", title: "Structured answer" },
  { scene: "17", name: "areas", title: "Areas to stay", taps: [{ name: "area-sheet", label: "Open Shoreditch", kind: "sheet", wait: 4000, title: "Area (tap a card)" }] },
  { scene: "18", name: "comparison", title: "Comparison table" },
  { scene: "19", name: "trip-update", title: "Trip update receipt" },
  { scene: "20", name: "day-trips", title: "Day trips", taps: [{ name: "daytrip-sheet", label: "Open Oxford", kind: "sheet", title: "Day trip (tap a card)" }] },
  { scene: "21", name: "empty-result", title: "Nothing found" },
  { scene: "22", name: "trip-summary", title: "Trip summary" },
];

// What the providers would have answered. Pictures are the app's own design photos.
const PHOTO = "/design/place-cafe.jpg";
const PLACE = {
  id: "p1", displayName: { text: "Sky Garden" }, formattedAddress: "1 Sky Garden Walk, London EC3M 8AF, UK", location: { latitude: 51.5113, longitude: -0.0835 },
  primaryType: "tourist_attraction", types: ["tourist_attraction", "point_of_interest"], googleMapsUri: "https://maps.google.com/?cid=1", websiteUri: "https://skygarden.london", nationalPhoneNumber: "020 7337 2344",
  rating: 4.6, userRatingCount: 61234, priceLevel: "PRICE_LEVEL_FREE",
  editorialSummary: { text: "A three-storey garden in the sky with open views across the city." },
  regularOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: 10:00 AM – 6:00 PM", "Tuesday: 10:00 AM – 6:00 PM", "Wednesday: 10:00 AM – 6:00 PM", "Thursday: 10:00 AM – 10:00 PM", "Friday: 10:00 AM – 10:00 PM", "Saturday: 10:00 AM – 9:00 PM", "Sunday: 10:00 AM – 9:00 PM"] },
  accessibilityOptions: { wheelchairAccessibleEntrance: true }, outdoorSeating: true, servesCocktails: true, reservable: true, goodForGroups: true,
  photos: ["a", "b", "c", "d"].map((n) => ({ name: `places/p1/photos/${n}` })),
  reviews: [
    { rating: 5, text: { text: "Free, and the view at sunset is unreal. Book the slot a week ahead." }, authorAttribution: { displayName: "Amara O." }, relativePublishTimeDescription: "2 weeks ago" },
    { rating: 4, text: { text: "Busy on weekends, but the terrace and the plants make up for it." }, authorAttribution: { displayName: "Jonas P." }, relativePublishTimeDescription: "a month ago" },
  ],
};
const STAY = {
  hotel: { hotelId: "h1", name: "The Hoxton, Holborn", description: "A lively hotel on the edge of Bloomsbury, with a rooftop bar and rooms that are bigger than they look.", images: ["/design/place-hotel.jpg", "/design/place-neighbourhood.jpg", "/design/place-rooftop-lounge.jpg"], facilities: ["Free WiFi", "Air conditioning", "Bar", "Restaurant", "Fitness centre", "24-hour front desk", "Pets allowed", "Non-smoking rooms"], checkinFrom: "15:00", checkinTo: "00:00", checkout: "11:00", address: "199-206 High Holborn, London WC1V 7BD", city: "London", country: "United Kingdom", latitude: 51.5176, longitude: -0.1199, stars: 4, rating: 9.1, reviewCount: 1200, roomCatalogue: [{ name: "Cosy Double", maxOccupancy: 2, photo: "/design/place-hotel.jpg", description: "Queen bed, rain shower." }] },
  rooms: [
    { rateId: "r1", name: "Cosy Double", boardName: "Breakfast", refundable: true, cancelBefore: "2026-09-28T12:00:00Z", maxOccupancy: 2, nightlyAmount: 230, totalAmount: 690, taxesAndFees: 60, currency: "GBP" },
    { rateId: "r2", name: "Roomy Twin", boardName: null, refundable: false, cancelBefore: null, maxOccupancy: 2, nightlyAmount: 205, totalAmount: 615, taxesAndFees: 54, currency: "GBP" },
  ],
  reviews: [{ rating: 9, headline: "Great location", positives: "Walkable to everything, lovely staff.", negatives: "Rooms are small.", text: null, date: "2026-09-02", travellerType: "Couple", country: "Canada", name: "Priya" }],
  sentiment: "Guests love the location and the staff; a few find the rooms compact.", nights: 3, checkin: "2026-10-01", checkout: "2026-10-04", currency: "GBP", assumedDates: false, provider: "liteapi", freshness: { retrievedAt: "2026-09-30T00:00:00Z" },
};
const EVENT = {
  title: "Michel Rivard", source: "ticketmaster", url: "https://example.com/e/1", imageUrl: "/design/place-concert-arena.jpg", date: "2026-10-02 20:00", doorsTime: "7:00 PM", showTime: "8:00 PM", admission: "Seated", status: "onsale",
  venueName: "Eventim Apollo", venueAddress: "45 Queen Caroline St, London W6 9QH", city: "London", latitude: 51.4903, longitude: -0.2247, performers: ["Michel Rivard"], lineupNote: null, genre: "Chanson", priceRange: "£35 – £68", onSale: "On sale now", promoter: "Live Nation",
  ageInfo: "All ages", about: "The Quebec songwriter plays songs from across a forty-year career, solo with a guitar and a piano.", whatToExpect: "Around two hours with an interval; sung in French, with a few words of English between songs.", pleaseNote: "Doors at 7pm.", seatmapUrl: null,
  ticketOptions: [{ label: "Ticketmaster", url: "https://example.com/t" }], sources: [{ title: "Eventim Apollo", url: "https://example.com/v" }],
};

async function mock(ctx) {
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  const PICTURES = { rooftop: "/design/discover-rooftop.jpg", cafe: "/design/place-cafe.jpg", music: "/design/discover-live-music.jpg", hotel: "/design/place-hotel.jpg", a: "/design/discover-rooftop.jpg", b: "/design/place-rooftop-lounge.jpg", c: "/design/place-neighbourhood.jpg", d: "/design/discover-live-music.jpg" };
  await ctx.route(/\/places\/google\/photo\?/, async (r) => {
    const picture = decodeURIComponent(new URL(r.request().url()).searchParams.get("name") ?? "").split("/").pop();
    await r.fulfill({ status: 302, headers: { location: PICTURES[picture] ?? PHOTO } });
  });
  await ctx.route(/\/places\/google\/about\?/, async (r) => r.fulfill(json({ about: { content: "Sky Garden sits at the top of the Walkie Talkie tower: a landscaped terrace, a bar and a restaurant, free to enter if you book a slot.", source: { title: "Sky Garden", url: "https://skygarden.london" } } })));
  // Each placeId lands somewhere different in central London, so map sheets fit several pins.
  const SPOTS = [[51.5113, -0.0835], [51.5129, -0.1337], [51.4993, -0.1273], [51.5076, -0.0994], [51.5265, -0.0780], [51.5117, -0.1240], [51.5194, -0.1270], [51.5055, -0.0754]];
  await ctx.route(/\/places\/google\?placeId=/, async (r) => {
    const id = new URL(r.request().url()).searchParams.get("placeId") ?? "p1";
    const [latitude, longitude] = SPOTS[(parseInt(id.replace(/\D/g, ""), 10) || 0) % SPOTS.length];
    await r.fulfill(json({ place: { ...PLACE, location: { latitude, longitude } }, freshness: { retrievedAt: "2026-09-30T00:00:00Z" } }));
  });
  await ctx.route(/\/api\/trips\/[^/]+\/stays\/h1/, async (r) => r.fulfill(json(STAY)));
  await ctx.route(/\/events\/detail\?/, async (r) => r.fulfill(json({ detail: EVENT })));
  // Places near Shoreditch, with the pictures above, so the area / day-trip sheets show real cards (not the empty state).
  const NEAR = [["Dishoom Shoreditch", "indian_restaurant", 51.5253, -0.0768, 4.7, "a"], ["Brick Lane Bakery", "bakery", 51.5218, -0.0716, 4.5, "cafe"], ["The Book Club", "bar", 51.5262, -0.0803, 4.3, "b"], ["Columbia Road Flower Market", "market", 51.5295, -0.0699, 4.6, "c"], ["Cereal Killer Cafe", "cafe", 51.5215, -0.0719, 4.1, "cafe"], ["Boundary Rooftop", "bar", 51.5247, -0.0788, 4.4, "d"]];
  const nearPlaces = NEAR.map(([name, category, latitude, longitude, rating, pic], i) => ({ provider: "google", providerId: `near${i}`, name, category, latitude, longitude, address: "Shoreditch, London", rating, userRatingCount: 800 + i * 310, sourceUrl: null, photoNames: [`places/near${i}/photos/${pic}`] }));
  // Rotated by the query, so different queries (an itinerary's stops) land on different points.
  await ctx.route(/\/api\/trips\/[^/]+\/places\?query=/, async (r) => {
    const q = decodeURIComponent(new URL(r.request().url()).searchParams.get("query") ?? "");
    // Day trips: Oxford questions get Oxford answers, so the map and the cards agree with the page.
    if (/oxford/i.test(q)) {
      const OX = [["Radcliffe Camera", "tourist_attraction", 51.7534, -1.2540, 4.8, "a"], ["Ashmolean Museum", "museum", 51.7554, -1.2600, 4.7, "c"], ["Christ Church", "church", 51.7500, -1.2563, 4.7, "b"], ["Bodleian Library", "library", 51.7541, -1.2540, 4.8, "d"], ["The Covered Market", "market", 51.7522, -1.2569, 4.5, "cafe"]];
      return r.fulfill(json({ places: OX.map(([name, category, latitude, longitude, rating, pic], i) => ({ provider: "google", providerId: `ox${i}`, name, category, latitude, longitude, address: "Oxford", rating, userRatingCount: 2400 + i * 400, sourceUrl: null, photoNames: [`places/ox${i}/photos/${pic}`] })) }));
    }
    const k = [...q].reduce((n, c) => n + c.charCodeAt(0), 0) % nearPlaces.length;
    await r.fulfill(json({ places: [...nearPlaces.slice(k), ...nearPlaces.slice(0, k)] }));
  });
  // The in-browser map reads its public token from a signed-in-only route; the harness has no session, so hand it the key from .env.local.
  if (MAPBOX) await ctx.route(/\/api\/config\/mapbox/, async (r) => r.fulfill(json({ token: MAPBOX })));
}

// An element shot scrolls the card under the fixed header, so the header is hidden for the card shots only (sheets keep it).
async function cardShot(page, path) {
  await page.evaluate(() => { document.querySelector("[data-live-header]").style.visibility = "hidden"; });
  await page.locator("[data-scene]").screenshot({ path });
  await page.evaluate(() => { document.querySelector("[data-live-header]").style.visibility = ""; });
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const manifest = [];
// The same states again as real DOM, for widgets.html (light only): see phone-widget-html.mjs.
const reg = makeRegistry();
const htmlWidgets = [];
const W = 390, H = 844;

for (const theme of themes) {
  mkdirSync(`${out}/${theme}`, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mock(ctx);
  await ctx.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
  for (const w of WIDGETS) {
    if (only.length && !only.includes(w.scene)) continue;
    const entry = { scene: w.scene, name: w.name, title: w.title, theme, shots: [], states: [] };
    const cap = async (mode, title, name) => { try { entry.states.push({ name, title, ...(await snapshot(page, reg, mode)) }); } catch (e) { console.log(`  html snapshot failed (${name}): ${String(e.message).split("\n")[0]}`); } };
    const open = async (attempt = 1) => {
      const page = await ctx.newPage();
      page.setDefaultTimeout(60000);
      try {
      await page.setViewportSize({ width: W, height: H });
      await page.goto(`${base}/dev-phone-audit/live?theme=${theme}&scene=${w.scene}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForSelector("[data-scene]", { timeout: 60000 });
      await page.waitForTimeout(1800);
      return page;
      } catch (e) {
        await page.close().catch(() => {});
        if (attempt >= 3) throw e;
        console.log(`  reopening ${w.scene} (attempt ${attempt + 1})`);
        return open(attempt + 1);
      }
    };
    let page = await open();
    const file = `${theme}/${w.name}.png`;
    await cardShot(page, `${out}/${file}`);
    entry.shots.push({ kind: "inline", title: "In the chat", file });
    await cap("card", "In the chat", "inline");
    console.log(`${theme} ${w.scene} ${w.name}: inline`);
    for (const t of w.taps ?? []) {
      try {
        if (t.kind === "popover") {
          const root = page.locator("[data-scene]");
          await root.locator(`[aria-label="${t.label}"]`).first().scrollIntoViewIfNeeded();
          await root.locator(`[aria-label="${t.label}"]`).first().click({ timeout: 8000 });
          await page.waitForTimeout(1200);
          const f = `${theme}/${w.name}--${t.name}.png`;
          await page.screenshot({ path: `${out}/${f}` });
          entry.shots.push({ kind: "sheet", title: t.title, file: f });
          await cap("page", t.title, t.name);
          await page.close(); page = await open();
        } else if (t.kind === "inline") {
          const loc = page.locator("[data-scene]").getByRole("button", { name: t.label, exact: t.exact });
          await loc.first().click({ timeout: 8000 });
          await page.waitForTimeout(900);
          const f = `${theme}/${w.name}--${t.name}.png`;
          await cardShot(page, `${out}/${f}`);
          entry.shots.push({ kind: "inline", title: t.title, file: f });
          await cap("card", t.title, t.name);
        } else {
          const root = page.locator("[data-scene]");
          if (t.pre) { await root.getByRole("button", { name: t.pre }).first().click({ timeout: 8000 }); await page.waitForTimeout(900); }
          // Whole-card taps are an aria-hidden overlay button (the card's own buttons are the accessible ones), so match its label too.
          let loc = root.getByRole("button", { name: t.label }).or(root.getByRole("link", { name: t.label }));
          if (t.css) loc = root.locator(`${t.css}:visible`);
          else if (typeof t.label === "string") loc = loc.or(root.locator(`[aria-label="${t.label}"]`));
          await (t.first ? loc.first() : loc.first()).click({ timeout: 8000 });
          const panel = page.locator("div.fixed.z-40").last();
          await panel.waitFor({ timeout: 8000 });
          await page.waitForTimeout(2800 + (t.wait ?? 0)); // maps: let the camera finish fitting the pins and the tiles draw
          const f = `${theme}/${w.name}--${t.name}.png`;
          await page.screenshot({ path: `${out}/${f}` });
          const shot = { kind: "sheet", title: t.title, file: f };
          await cap("sheet", t.title, t.name);
          // The whole length of the sheet: grow the window to the sheet's content, take it, put the window back.
          const full = await page.evaluate(() => {
            const sheet = [...document.querySelectorAll("div.fixed.z-40")].pop();
            if (!sheet) return 0;
            const scrollers = [...sheet.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4);
            const best = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            return best ? best.scrollHeight - best.clientHeight : 0;
          });
          if (full > 40) {
            await page.setViewportSize({ width: W, height: Math.min(H + full, 5200) });
            await page.waitForTimeout(1500);
            const g = `${theme}/${w.name}--${t.name}--full.png`;
            await page.screenshot({ path: `${out}/${g}` });
            shot.full = g;
            await cap("sheet", `${t.title}, full length`, `${t.name}-full`);
            await page.setViewportSize({ width: W, height: H });
          }
          entry.shots.push(shot);
          await page.close();
          page = await open();
        }
        console.log(`${theme} ${w.scene} ${w.name}: ${t.name}`);
      } catch (e) {
        console.log(`${theme} ${w.scene} ${w.name}: ${t.name} FAILED ${String(e.message).split("\n")[0]}`);
        entry.shots.push({ kind: "failed", title: t.title, error: String(e.message).split("\n")[0] });
        await page.close(); page = await open();
      }
    }
    await page.close();
    manifest.push(entry);
    if (theme === "light") htmlWidgets.push(entry);
  }
  await ctx.close();
}
writeFileSync(`${out}/manifest${only.length ? "-partial" : ""}.json`, JSON.stringify(manifest, null, 1));
await browser.close();
if (htmlWidgets.length) {
  const file = `${out}/widgets${only.length ? "-partial" : ""}.html`;
  writeFileSync(file, buildDocument(htmlWidgets, reg));
  console.log(`${file}: ${htmlWidgets.reduce((n, w) => n + w.states.length, 0)} frames`);
}
