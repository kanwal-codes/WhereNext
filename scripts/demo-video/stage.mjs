// Stage helpers: browser at 1440x810 CSS px / 1920x1080 device px, in-page captions + visible cursor, smooth mouse.
import { chromium } from "../../node_modules/playwright-core/index.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { startRec } from "./rec.mjs";

export const BASE = "http://localhost:4000";
const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const overlay = () => {
  const css = `
  #__cap{position:fixed;left:50%;bottom:52px;transform:translate(-50%,14px);z-index:2147483647;pointer-events:none;opacity:0;
    transition:opacity .45s ease,transform .45s ease;background:oklch(0.205 0.012 65 / .94);color:#fff;border-radius:999px;
    padding:15px 30px;font:500 26px/1.15 var(--font-display),Outfit,system-ui,sans-serif;letter-spacing:-.012em;white-space:nowrap;
    box-shadow:0 10px 40px rgb(0 0 0/.22)}
  #__cap.on{opacity:1;transform:translate(-50%,0)}
  #__cap b{color:oklch(0.78 0.14 45);font-weight:600}
  #__cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;margin:-3px 0 0 -3px;
    filter:drop-shadow(0 2px 4px rgb(0 0 0/.35));transition:transform .06s linear}
  #__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
    border:3px solid oklch(0.64 0.175 36);opacity:0}
  #__rip.go{animation:__rip .55s ease-out}
  @keyframes __rip{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(3.2)}}`;
  const mount = () => {
    if (document.getElementById("__cap")) return;
    const st = document.createElement("style"); st.textContent = css; document.documentElement.appendChild(st);
    const cap = document.createElement("div"); cap.id = "__cap"; document.documentElement.appendChild(cap);
    const cur = document.createElement("div"); cur.id = "__cur";
    cur.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5v17l4.6-4.1 3.1 6.6 2.6-1.2-3.1-6.5 6.3-.4z" fill="#1d1a17" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    cur.style.transform = "translate(-100px,-100px)"; document.documentElement.appendChild(cur);
    const rip = document.createElement("div"); rip.id = "__rip"; document.documentElement.appendChild(rip);
    addEventListener("mousemove", e => { cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener("mousedown", e => { rip.style.left = e.clientX + "px"; rip.style.top = e.clientY + "px"; rip.classList.remove("go"); void rip.offsetWidth; rip.classList.add("go"); }, true);
    window.__cap = html => { if (html) { cap.innerHTML = html; cap.classList.add("on"); } else cap.classList.remove("on"); };
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
};

export async function open({ signedIn = true, name }) {
  const browser = await chromium.launch({ executablePath: exe, args: ["--force-device-scale-factor=1.3333", "--window-size=1440,810"] });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  if (signedIn) {
    const { email, password } = JSON.parse(readFileSync("qa-login.json", "utf8"));
    await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    await page.fill("input[type=email]", email); await page.fill("input[type=password]", password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname.startsWith("/trips"), null, { timeout: 60000 });
  }
  await ctx.addInitScript(overlay);
  await page.addInitScript(() => { try { localStorage.setItem("wn:cookie-consent", "essential"); } catch {} });
  const marks = {};
  let rec;
  const S = {
    page, browser, marks,
    async goto(url) { await page.goto(url.startsWith("http") ? url : BASE + url, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {}); },
    async start() { rec = await startRec(page, name); S.t = rec.now; await page.mouse.move(720, 700); },
    mark(k) { marks[k] = +rec.now().toFixed(2); },
    cap: html => page.evaluate(h => window.__cap && window.__cap(h), html),
    async capFor(html, ms) { await S.cap(html); await page.waitForTimeout(ms); await S.cap(""); await page.waitForTimeout(450); },
    async moveTo(target, { dx = 0, dy = 0 } = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      let box = await loc.boundingBox();
      if (!box || box.y < 0 || box.y + box.height > 810) { await loc.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(350); box = await loc.boundingBox(); }
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 28 });
    },
    async click(target) { await S.moveTo(target); await page.waitForTimeout(180); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); },
    async type(text, delay = 48) { await page.keyboard.type(text, { delay }); },
    async finish() { S.mark("end"); const r = await rec.stop(); writeFileSync(`marks-${name}.json`, JSON.stringify(marks)); await browser.close(); return r; },
  };
  return S;
}
