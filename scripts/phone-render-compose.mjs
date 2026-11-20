// Puts raw phone captures into an iPhone frame on a warm canvas, one image per screen, plus overview boards and a gallery page.
//   node scripts/phone-render-compose.mjs <rawDir> <outDir> <groupName> [catalog.json]
// <rawDir> holds PNGs captured at 393x852 (3x). catalog.json is [{ id, title, note }] in display order (default: every PNG, by file name).
// Output: <outDir>/framed/<group>/<id>.png, <outDir>/boards/<group>-<n>.png. The gallery is built by scripts/phone-render-gallery.mjs.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const [rawDir, outDir, group = "screens", catalogPath] = process.argv.slice(2);
if (!rawDir || !outDir) { console.error("usage: node scripts/phone-render-compose.mjs <rawDir> <outDir> <group> [catalog.json]"); process.exit(1); }
const raw = resolve(rawDir), out = resolve(outDir);
mkdirSync(join(out, "framed", group), { recursive: true });
mkdirSync(join(out, "boards"), { recursive: true });

const media = resolve(".next-dev-4000/static/media");
const font = (name) => readdirSync(media).find((f) => f.startsWith(`${name}-latin.`) && f.endsWith(".woff2"));
const fonts = existsSync(media) && font("outfit") && font("figtree")
  ? `@font-face{font-family:Outfit;font-weight:100 900;src:url("${pathToFileURL(join(media, font("outfit")))}")}@font-face{font-family:Figtree;font-weight:300 900;src:url("${pathToFileURL(join(media, font("figtree")))}")}`
  : "";

const pngs = readdirSync(raw).filter((f) => /\.png$/.test(f) && !/--full\.png$/.test(f)).sort();
const catalog = catalogPath ? JSON.parse(readFileSync(catalogPath, "utf8")) : pngs.map((f) => ({ id: f.replace(/\.png$/, ""), title: f.replace(/\.png$/, "").replace(/^\d+-/, "").replaceAll("-", " ") }));
const items = catalog.filter((c) => existsSync(join(raw, `${c.id}.png`)));

const CSS = `${fonts}
*{box-sizing:border-box;margin:0}
body{font-family:Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#2a2420}
.canvas{background:radial-gradient(1100px 760px at 50% -8%,#fff3ea 0%,rgba(255,243,234,0) 70%),radial-gradient(900px 700px at 105% 105%,#eef3f6 0%,rgba(238,243,246,0) 65%),linear-gradient(180deg,#f8f5f0,#efe9e0)}
.cell{display:flex;flex-direction:column;align-items:center}
.phone{position:relative;width:421px;height:880px;padding:14px;border-radius:70px;
 background:linear-gradient(145deg,#34322f 0%,#171614 38%,#0b0b0a 100%);
 box-shadow:inset 0 0 0 1.5px #78726a,inset 0 0 0 3.5px #15140f,0 1px 2px rgba(40,26,10,.18),0 18px 30px -12px rgba(60,40,18,.28),0 50px 90px -30px rgba(60,40,18,.38)}
.phone i{position:absolute;width:4px;border-radius:2px;background:linear-gradient(90deg,#8b857c,#4d4943)}
.phone .b1{left:-3px;top:150px;height:30px}.phone .b2{left:-3px;top:206px;height:58px}.phone .b3{left:-3px;top:278px;height:58px}.phone .pw{right:-3px;top:236px;height:92px}
.screen{position:relative;width:393px;height:852px;border-radius:56px;overflow:hidden;background:#fff}
.screen img{display:block;width:393px;height:852px}
.island{position:absolute;left:50%;top:11px;width:124px;height:36px;margin-left:-62px;border-radius:20px;background:#000;box-shadow:inset 0 0 0 1px #1a1a19}
.status{position:absolute;left:0;right:0;top:0;height:59px;display:flex;justify-content:space-between;align-items:center;padding:6px 36px 0 52px;font:600 17px Figtree,system-ui;letter-spacing:-.01em}
.status .r{display:flex;gap:7px;align-items:center}
.home{position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px}
.cap{margin-top:34px;text-align:center;max-width:430px}
.cap .e{font:600 11px Figtree;letter-spacing:.14em;text-transform:uppercase;color:#8a8279}
.cap .t{margin-top:8px;font:500 26px/1.15 Outfit,system-ui;letter-spacing:-.02em}
.cap .n{margin-top:8px;font:400 14px/1.45 Figtree;color:#6e675f}
`;

const phone = (item, img, tone) => `<div class="phone"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="pw"></i>
<div class="screen"><img src="${img}">
<div class="status" style="color:${tone === "dark" ? "#14110f" : "#fff"}"><span>9:41</span><span class="r">
<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>
<svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1-1.1A10.4 10.4 0 0 0 8 .6C5.200.6 2.700 1.700 1 3.500l1 1.100A8.700 8.700 0 0 1 8 2.200Zm0 3.300c1.400 0 2.700.5 3.700 1.400l1-1.100A7 7 0 0 0 8 3.900c-1.800 0-3.500.7-4.700 1.900l1 1.100C5.300 6 6.600 5.500 8 5.500Zm0 3.200c.7 0 1.300.3 1.800.7L8 11 6.200 9.400c.5-.4 1.100-.7 1.800-.7Z"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.800" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.500" fill="currentColor"/><path d="M25 4.500v4c.8-.3 1.500-1.100 1.500-2s-.7-1.700-1.500-2Z" fill="currentColor" opacity=".45"/></svg>
</span></div><div class="island"></div><div class="home" style="background:${tone === "dark" ? "#14110f" : "#fff"}"></div></div></div>`;

const cell = (item, img, tone, withCaption = true) => `<div class="cell">${phone(item, img, tone)}${withCaption ? `<div class="cap"><div class="e">${item.eyebrow ?? "Phone"}</div><div class="t">${item.title}</div>${item.note ? `<div class="n">${item.note}</div>` : ""}</div>` : ""}</div>`;
const file = (c) => pathToFileURL(join(raw, `${c.id}.png`)).href;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 760, height: 1280 }, deviceScaleFactor: 2 });

// A page built from a real file can load the local pictures and fonts; one built in memory (about:blank) cannot.
const show = async (html) => {
  const f = join(out, "_compose.html");
  writeFileSync(f, `<!doctype html><meta charset="utf-8">${html}`);
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
};

// the status bar text colour follows the picture under it
async function tone(c) {
  await page.setContent(`<img id="i" src="data:image/png;base64,${readFileSync(join(raw, `${c.id}.png`)).toString("base64")}">`);
  await page.waitForFunction(() => document.getElementById("i").complete);
  return page.evaluate(() => {
    const i = document.getElementById("i"), k = document.createElement("canvas");
    k.width = i.naturalWidth; k.height = i.naturalHeight; const x = k.getContext("2d"); x.drawImage(i, 0, 0);
    const s = i.naturalWidth / 393, d = x.getImageData(Math.round(60 * s), Math.round(30 * s), Math.round(120 * s), 1).data;
    let l = 0; for (let n = 0; n < d.length; n += 4) l += 0.299 * d[n] + 0.587 * d[n + 1] + 0.114 * d[n + 2];
    return l / (d.length / 4) > 128 ? "dark" : "light";
  });
}

for (const c of items) {
  const t = await tone(c);
  await show(`<style>${CSS}</style><body style="margin:0"><div class="canvas" style="padding:70px 0 80px;width:760px;display:flex;justify-content:center">${cell(c, file(c), t)}</div></body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.locator(".canvas").screenshot({ path: join(out, "framed", group, `${c.id}.png`) });
  c.tone = t;
  console.log(`framed ${c.id}`);
}

// boards: four phones to a row, three rows to a board (no captions on the phones; the title sits under each)
const PER = 4;
for (let b = 0; b * PER * 2 < items.length; b += 1) {
  const slice = items.slice(b * PER * 2, b * PER * 2 + PER * 2);
  const grid = slice.map((c) => cell(c, file(c), c.tone)).join("");
  const width = 2140;
  await page.setViewportSize({ width, height: 1200 });
  await show(`<style>${CSS} body{margin:0} .grid{display:grid;grid-template-columns:repeat(${PER},421px);gap:90px 80px;justify-content:center;padding:90px 0 100px}
  .head{padding:90px 110px 0;display:flex;align-items:baseline;justify-content:space-between}
  .head .h{font:500 44px Outfit;letter-spacing:-.025em}.head .s{font:600 12px Figtree;letter-spacing:.16em;text-transform:uppercase;color:#8a8279}</style>
  <div class="canvas" style="width:${width}px"><div class="head"><div class="h">Where Next on a phone</div><div class="s">${group} · board ${b + 1}</div></div><div class="grid">${grid}</div></div>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.locator(".canvas").screenshot({ path: join(out, "boards", `${group}-${b + 1}.png`) });
  console.log(`board ${group}-${b + 1} (${slice.length} phones)`);
}
await browser.close();
