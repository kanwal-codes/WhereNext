// Phone redesign: screenshots of the dev server at phone widths, for review next to the renders.
//   node scripts/phone-capture.mjs harness            # every Roam widget fixture, light and dark (no sign-in)
//   node scripts/phone-capture.mjs trip <tripId>      # the saved test trip's pages, signed in as a LOCAL test user
//   node scripts/phone-capture.mjs shell <tripId>     # asserts the phone shell: no tab bar, drawer opens/closes/navigates, focus returns
// Refuses to run unless the server's Supabase is the local Docker stack (127.0.0.1 / localhost). Output: ./phone-shots/
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.PHONE_BASE ?? "http://localhost:4000";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabase) || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)) {
  console.error(`Refusing to run: the phone work only ever touches the local stack (base ${base}, supabase ${supabase}).`);
  process.exit(1);
}
const widths = (process.env.PHONE_WIDTHS ?? "390").split(",").map(Number);
const out = process.env.PHONE_OUT ?? "phone-shots";
mkdirSync(out, { recursive: true });
const [mode = "harness", tripId] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function harness() {
  for (const theme of ["light", "dark"]) {
    for (const edge of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.goto(`${base}/dev-phone-audit?theme=${theme}${edge ? "&edge=1" : ""}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForSelector("[data-scene]", { timeout: 120000 });
      await page.waitForTimeout(1500);
      for (const el of await page.$$("[data-scene]")) {
        const id = await el.getAttribute("data-scene");
        await el.screenshot({ path: `${out}/harness-${theme}-${id}.png` });
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${theme}${edge ? " edge" : ""}: overflowX ${overflow}`);
      await page.close();
    }
  }
}

async function trip(id) {
  const email = process.env.PHONE_TEST_EMAIL, password = process.env.PHONE_TEST_PASSWORD;
  if (!id || !email || !password) { console.error("usage: PHONE_TEST_EMAIL=… PHONE_TEST_PASSWORD=… node scripts/phone-capture.mjs trip <tripId>"); process.exit(1); }
  const routes = ["", "/chat", "/group", "/itinerary", "/discover", "/today", "/stay", "/map", "/bookings", "/budget", "/knowledge"];
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await page.click("button[type=submit]");
    await page.waitForURL(/\/trips/, { timeout: 60000 });
    for (const r of routes) {
      await page.goto(`${base}/trips/${id}${r}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.waitForTimeout(5000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `${out}/trip-${width}${r.replaceAll("/", "-") || "-overview"}.png` });
      console.log(`${width} ${r || "/"}: overflowX ${overflow}`);
    }
    await ctx.close();
  }
}


async function shell(id) {
  const email = process.env.PHONE_TEST_EMAIL, password = process.env.PHONE_TEST_PASSWORD;
  if (!id || !email || !password) { console.error("usage: PHONE_TEST_EMAIL=… PHONE_TEST_PASSWORD=… node scripts/phone-capture.mjs shell <tripId>"); process.exit(1); }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  let failed = 0;
  const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? " (" + extra + ")" : ""}`); if (!ok) failed++; };
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.fill("input[type=email]", email); await page.fill("input[type=password]", password); await page.click("button[type=submit]");
  await page.waitForURL(/\/trips/, { timeout: 60000 });
  await page.goto(`${base}/trips/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(6000);
  const menu = page.getByRole("button", { name: "Open trip menu" });
  check("no tab bar", (await page.locator("[data-trip-tabbar]").count()) === 0);
  check("menu button present", (await menu.count()) === 1);
  await menu.click(); await page.waitForTimeout(700);
  const dialog = page.getByRole("dialog", { name: "Trip menu" });
  check("drawer opens", await dialog.isVisible());
  check("overview row is current", (await dialog.locator('a[aria-current="page"]').innerText()).includes("Overview"));
  check("rows are grouped Trip / Plan / Keep", (await dialog.locator("p.eyebrow").allInnerTexts()).join(",").toLowerCase() === "trip,plan,keep");
  await page.keyboard.press("Escape"); await page.waitForTimeout(700);
  check("Escape closes it", !(await dialog.isVisible().catch(() => false)));
  check("focus returns to the menu button", await menu.evaluate((el) => el === document.activeElement));
  await menu.click(); await page.waitForTimeout(600);
  await dialog.getByRole("link", { name: /^Roam/ }).click();
  await page.waitForURL(/\/chat$/, { timeout: 120000 });
  check("navigates to Roam", true);
  check("Roam header says Roam", (await page.locator("[data-trip-topbar] h1").innerText()) === "Roam");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no sideways scroll", overflow === 0, `overflowX ${overflow}`);
  await ctx.close();
  if (failed) { console.error(`${failed} check(s) failed`); process.exitCode = 1; }
}

try { await (mode === "trip" ? trip(tripId) : mode === "shell" ? shell(tripId) : harness()); } finally { await browser.close(); }
