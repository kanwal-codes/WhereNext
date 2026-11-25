// Phone renders of every screen and its main states: signed in as a LOCAL demo user (scripts/phone-render-seed.mjs), at an iPhone 15 Pro
// viewport (393x852, 3x) with the real safe areas (59px top, 34px bottom), so what you see is what a phone shows.
//   PHONE_TEST_EMAIL=… PHONE_TEST_PASSWORD=… node scripts/phone-render-screens.mjs <tripId> [shotId|prefix ...]
// Needs the harness dev server (scripts/dev-phone.sh, :4000) on the local Docker stack. Refuses anything that is not local.
// Output: <PHONE_RENDER_OUT or docs/design/renders/phone/screens>/<id>.png and catalog.json (title + note per shot, in order).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.PHONE_BASE ?? "http://localhost:4000";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const local = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u);
if (!local(base) || !local(supabase)) { console.error("Refusing: local stack only."); process.exit(1); }
const [tripId, ...only] = process.argv.slice(2);
const email = process.env.PHONE_TEST_EMAIL, password = process.env.PHONE_TEST_PASSWORD;
if (!tripId || !email || !password) { console.error("usage: PHONE_TEST_EMAIL=… PHONE_TEST_PASSWORD=… node scripts/phone-render-screens.mjs <tripId> [shot ...]"); process.exit(1); }
const out = process.env.PHONE_RENDER_OUT ?? "docs/design/renders/phone/screens";
mkdirSync(out, { recursive: true });

const W = 393, H = 852, DSF = Number(process.env.PHONE_DSF ?? 3);
const T = (p = "") => `/trips/${tripId}${p}`;
const pause = (page, ms) => page.waitForTimeout(ms);
// Content, not skeletons: wait for the network to go quiet and for every loading placeholder to leave, then a beat for entrance motion.
async function ready(page, ms = 2500) {
  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll(".skeleton, [aria-busy=true]").length === 0, null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
const step = async (label, fn) => { try { await fn(); return true; } catch (e) { console.log(`   (${label}: ${String(e).split("\n")[0].slice(0, 110)})`); return false; } };

// --- interactions
const menu = (page) => page.getByRole("button", { name: /menu|navigation/i }).first();
const closeSheet = async (page) => { await page.keyboard.press("Escape"); await pause(page, 700); };
// Roam's log is its own scroller: bring the nth widget (with the sentence that introduces it) to the top of the log.
const chatTo = (n, lead = 64) => async (page) => {
  await page.evaluate(({ n, lead }) => {
    const log = document.querySelector('[role="log"]');
    const w = log?.querySelectorAll("section.roam-widget")[n];
    if (!log || !w) throw new Error(`no widget ${n}`);
    const turn = w.closest(".turn") ?? w;
    log.scrollTop += turn.getBoundingClientRect().top - log.getBoundingClientRect().top - lead + 8;
  }, { n, lead });
  await pause(page, 1200);
};
const tapLabel = (re) => async (page) => { await page.locator(`[aria-label^="${re}"]`).first().click({ force: true }); await pause(page, 2600); await ready(page, 1500); };
const scrollPage = (y) => async (page) => { await page.evaluate((y) => window.scrollTo(0, y), y); await pause(page, 900); };
// The map sheet moves by pointer drag on its grip.
const dragGrip = (dy) => async (page) => {
  const g = page.locator("[data-sheet-grip]").first();
  const b = await g.boundingBox();
  if (!b) throw new Error("no grip");
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) { await page.mouse.move(x, y + (dy * i) / 12); await pause(page, 16); }
  await page.mouse.up(); await pause(page, 1500);
};

// path, then shots on that page in order. A shot that leaves a sheet open sets `reload` so the next one starts clean.
const PAGES = [
  { path: "/trips", shots: [
    { id: "01-trips-home", title: "All trips", note: "A calm start: say where, or pick up a trip." },
    { id: "02-trips-list", title: "Your trips", note: "Real covers, dates and a countdown on every card.", act: scrollPage(520) },
  ] },
  { path: T(), shots: [
    { id: "03-overview", title: "Trip overview", note: "The trip at a glance, and the one next step." },
    { id: "04-trip-menu", title: "Trip menu", note: "One drawer for every part of the trip.", act: async (page) => { await menu(page).click(); await pause(page, 1200); }, reload: true },
    { id: "05-overview-more", title: "The trip, in rows", note: "Stay, bookings, group chat, route and dates.", act: scrollPage(700) },
  ] },
  { path: T("/chat"), wait: 3500, shots: [
    { id: "06-roam-plan", title: "Roam: a first plan", note: "Ask once; the plan builds beside the conversation.", act: chatTo(0) },
    { id: "07-roam-places", title: "Roam: places to eat", note: "Real places, ratings and photos, ready to add to a day.", act: chatTo(1) },
    { id: "08-roam-flights", title: "Roam: flights", note: "One fare wins both labels, so it gets the best card.", act: chatTo(2) },
    { id: "09-roam-weather", title: "Roam: the forecast", note: "A week at a glance, with what to pack.", act: chatTo(3) },
    { id: "10-roam-budget", title: "Roam: the budget", note: "A typical day against your own limit.", act: chatTo(4) },
    { id: "11-place-sheet", title: "A place, opened", note: "Tap any card for hours, reviews and a map.", act: async (page) => { await chatTo(1)(page); await tapLabel("Open Joe Beef")(page); }, reload: true },
    { id: "12-flight-sheet", title: "A flight, opened", note: "The whole journey, in order.", act: async (page) => { await chatTo(2)(page); await page.locator('button[aria-pressed]', { hasText: "per person" }).first().click(); await pause(page, 2600); }, reload: true },
  ] },
  { path: T("/group"), wait: 3500, shots: [
    { id: "13-group-chat", title: "Group chat", note: "Friends and Roam in one thread." },
  ] },
  { path: T("/itinerary"), shots: [
    { id: "14-plan", title: "Plan", note: "Day by day, as a timeline you can reshape." },
    { id: "15-plan-stop", title: "A stop's options", note: "Time, order, day, lock or remove.", act: async (page) => { await page.getByRole("button", { name: /more|options|actions/i }).first().click(); await pause(page, 1400); }, reload: true },
    { id: "16-plan-days", title: "Pick a day", note: "Jump anywhere in the trip.", act: async (page) => { await page.getByRole("button", { name: /day|choose|pick/i }).first().click(); await pause(page, 1400); }, reload: true },
  ] },
  { path: T("/discover"), wait: 4000, shots: [
    { id: "17-discover", title: "Discover", note: "Roam's pick first, then the city by category." },
    { id: "18-discover-filters", title: "Filters", note: "Sub-types and compare live one tap away.", act: async (page) => { await page.getByRole("button", { name: /filter/i }).first().click(); await pause(page, 1400); }, reload: true },
    { id: "19-discover-place", title: "A place, opened", note: "Photos, hours, and a way to add it to the plan.", act: tapLabel("Open Notre-Dame"), reload: true },
  ] },
  { path: T("/stay"), wait: 5000, shots: [
    { id: "20-stay", title: "Stay", note: "Photo cards with the rate for your dates." },
    { id: "21-stay-more", title: "More stays", note: "A quiet list that keeps the price in view.", act: scrollPage(900) },
  ] },
  { path: T("/map"), wait: 7000, shots: [
    { id: "22-getting-around", title: "Getting around", note: "Your day on a map, with the sheet halfway up." },
    { id: "23-getting-around-up", title: "Getting around, pulled up", note: "The whole day, leg by leg.", act: dragGrip(-420), reload: true },
    { id: "24-getting-around-down", title: "Getting around, tucked away", note: "Just the map, with the route drawn.", act: dragGrip(380), reload: true },
  ] },
  { path: T("/today"), shots: [{ id: "25-today", title: "Today", note: "What's next, and what's after." }] },
  { path: T("/knowledge"), shots: [{ id: "26-what-roam-remembers", title: "What Roam remembers", note: "Everything it knows about the trip, editable." }] },
  { path: T("/bookings"), shots: [
    { id: "27-bookings", title: "Bookings", note: "Flights, stays and tickets in one place." },
    { id: "28-bookings-more", title: "Bookings, further down", note: "The timeline, in order.", act: scrollPage(700) },
  ] },
  { path: "/account", shots: [{ id: "29-account", title: "Account", note: "Your profile, preferences and trips." }] },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const newCtx = () => browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true, colorScheme: "light" });
async function insets(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34, left: 0, right: 0 } }).catch(() => {});
}
const want = (id) => !only.length || only.some((o) => id === o || id.startsWith(o));
const catalog = [];
const take = async (page, s) => { await page.screenshot({ path: `${out}/${s.id}.png` }); catalog.push({ id: s.id, title: s.title, note: s.note, eyebrow: "Phone" }); console.log(`${s.id}: ok`); };

// ---- signed in
{
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await insets(ctx, page);
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await pause(page, 3000);
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/trips/, { timeout: 60000 });
  for (const entry of PAGES) {
    if (!entry.shots.some((s) => want(s.id))) continue;
    const open = async () => {
      await page.goto(`${base}${entry.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await ready(page, entry.wait ?? 2500);
    };
    await open();
    for (const s of entry.shots) {
      if (!want(s.id)) continue;
      const ok = s.act ? await step(s.id, () => s.act(page)) : true;
      if (ok) await take(page, s); else console.log(`${s.id}: SKIPPED`);
      if (s.reload) await open();
    }
  }
  await ctx.close();
}

// ---- signed out
{
  const ctx = await newCtx();
  const page = await ctx.newPage();
  await insets(ctx, page);
  const PUBLIC = [
    { id: "30-landing", path: "/", title: "Landing", note: "Say it once; Roam builds the plan.", wait: 6000 },
    { id: "31-landing-story", path: "/", title: "Landing, the story", note: "Calm scenes that explain the idea.", wait: 6000, act: scrollPage(2300) },
    { id: "32-sign-in", path: "/sign-in", title: "Sign in", note: "Email, or Google." },
    { id: "33-sign-up", path: "/sign-up", title: "Create an account", note: "Free, and saves the trip you started." },
  ];
  for (const s of PUBLIC) {
    if (!want(s.id)) continue;
    await page.goto(`${base}${s.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await ready(page, s.wait ?? 2500);
    if (s.act) await step(s.id, () => s.act(page));
    await take(page, s);
  }
  await ctx.close();
}
writeFileSync(`${out}/catalog.json`, JSON.stringify(catalog.sort((a, b) => a.id.localeCompare(b.id)), null, 1));
await browser.close();
