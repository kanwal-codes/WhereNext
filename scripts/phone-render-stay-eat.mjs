// Phone designs for the Stay and Eat screens, drawn with the app's own tokens, fonts and the patterns the Flights page set: the place pill in the header,
// one row of pills under it (each shows what it is set to; most open a small panel over the list), photo cards, the top sheet for dates and guests, and the
// bottom sheet for sort and filter. Not wired to data: sample places and stays.
//   node scripts/phone-render-stay-eat.mjs <photosDir> <outDir>
// photosDir holds r0..r4.jpeg (Joe Beef, Olive et Gourmando, Schwartz's, a bar, Bouillon Bilk) and stay-pool.png, stay-room.png.
// Output: <outDir>/raw/<id>.png at 393x852 (3x) + catalog.json. Frame them with scripts/phone-render-compose.mjs.
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const [photosDir, outDir] = process.argv.slice(2);
if (!photosDir || !outDir) { console.error("usage: node scripts/phone-render-stay-eat.mjs <photosDir> <outDir>"); process.exit(1); }
const raw = join(resolve(outDir), "raw");
mkdirSync(raw, { recursive: true });
const uri = (f) => { const b = readFileSync(join(photosDir, f)); return `data:image/${f.endsWith("png") ? "png" : "jpeg"};base64,${b.toString("base64")}`; };
const PH = { joe: uri("r0.jpeg"), olive: uri("r1.jpeg"), schwartz: uri("r2.jpeg"), bar: uri("r3.jpeg"), bilk: uri("r4.jpeg"), pool: uri("stay-pool.png"), room: uri("stay-room.png") };

const media = resolve(".next-dev-4000/static/media");
const face = (n) => readdirSync(media).find((f) => f.startsWith(`${n}-latin.`) && f.endsWith(".woff2"));
const FONTS = `@font-face{font-family:Outfit;font-weight:100 900;src:url("${pathToFileURL(join(media, face("outfit")))}")}@font-face{font-family:Figtree;font-weight:300 900;src:url("${pathToFileURL(join(media, face("figtree")))}")}`;

const I = {
  menu: '<path d="M4 7h16M4 12h11M4 17h14"/>', mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>', heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>', down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>', cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  minus: '<path d="M5 12h14"/>',
};
const svg = (n, st = "") => `<svg class="ic"${st ? ` style="${st}"` : ""} viewBox="0 0 24 24">${I[n]}</svg>`;
const star = '<svg class="star" viewBox="0 0 24 24"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';

const CSS = `${FONTS}
:root{--surface:oklch(.982 .003 80);--muted:oklch(.967 .004 80);--ink:oklch(.205 .012 65);--soft:oklch(.42 .012 70);--mfg:oklch(.5 .012 72);--hair:oklch(.925 .005 80);--input:oklch(.88 .006 80);
--coral:oklch(.64 .175 36);--coral-ink:oklch(.48 .14 34);--coral-soft:oklch(.962 .025 45);--pos:oklch(.44 .1 158);
--shadow-soft:0 1px 2px oklch(.2 .012 65/6%),0 3px 10px -3px oklch(.2 .012 65/7%);--lift:0 1px 2px oklch(.2 .012 65/5%),0 6px 12px -6px oklch(.2 .012 65/9%),0 14px 24px -12px oklch(.2 .012 65/11%)}
*{box-sizing:border-box;margin:0}
html,body{width:393px;background:#fff;font:400 14px/1.4 Figtree,system-ui;color:var(--ink);-webkit-font-smoothing:antialiased}
.page{position:relative;width:393px;height:852px;padding:59px 16px 0;overflow:hidden}
.ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.hdr{display:flex;align-items:center;justify-content:space-between;height:44px;margin-top:8px}
.circ{position:relative;width:44px;height:44px;border-radius:50%;background:var(--muted);display:grid;place-items:center}
.circ .dot{position:absolute;top:9px;right:9px;width:10px;height:10px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 2px #fff}
.city{height:44px;padding:0 16px 0 20px;border-radius:999px;background:var(--muted);display:flex;align-items:center;gap:6px;font:600 17px Outfit;letter-spacing:-.01em}
.city .ic{width:16px;height:16px;opacity:.7}
.pills{display:flex;gap:8px;margin:20px -16px 0;padding:0 16px;overflow:hidden}
.chip{height:40px;padding:0 15px;border-radius:999px;border:1px solid var(--input);background:#fff;font:500 14px Figtree;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none}
.chip .ic{width:14px;height:14px}.chip .ic.dim{opacity:.6}
.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.panel{position:absolute;left:16px;right:16px;z-index:8;background:#fff;border-radius:20px;box-shadow:var(--lift),0 0 0 1px var(--hair);padding:16px}
.panel .ph{display:flex;align-items:center;justify-content:space-between}.panel .ph b{font:600 14px Figtree}
.panel .ph .r{display:flex;align-items:center;gap:4px;margin-right:-8px}.panel .ph u{font:500 14px Figtree;color:var(--soft);padding:6px 10px;text-underline-offset:3px}
.panel .ph .x{width:32px;height:32px;display:grid;place-items:center;color:var(--mfg)}.panel .ph .x .ic{width:16px;height:16px}
.wrap{display:flex;flex-wrap:wrap;gap:8px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.gc{height:40px;border-radius:999px;border:1px solid var(--input);display:grid;place-items:center;font:500 14px Figtree;padding:0 8px;text-align:center;white-space:nowrap}
.gc.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.tick{display:inline-flex;align-items:center;gap:6px}.tick .ic{width:14px;height:14px}
.slider{position:relative;height:18px;margin-top:10px}.slider i{position:absolute;display:block}
.slider .tr{left:0;right:0;top:7px;height:4px;border-radius:2px;background:var(--ink)}.slider .th{right:0;top:0;width:18px;height:18px;border-radius:50%;background:var(--ink)}
/* stay card: the photo, the name and the price, the facts */
.sc{margin-top:20px}.sc .ph{position:relative;height:226px;border-radius:24px;overflow:hidden;background-size:cover;background-position:center}
.sc .l1{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-top:12px}
.sc .t{font:500 20px/1.15 Outfit;letter-spacing:-.015em}.sc .pr{font:500 20px/1.15 Outfit;letter-spacing:-.015em;text-align:right;white-space:nowrap}
.sc .l2{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-top:4px;color:var(--mfg);font-size:14px}
.sc .m{display:flex;align-items:center;gap:6px}.sc .tot{font-size:13px;text-align:right}
.star{width:14px;height:14px;fill:var(--coral);flex:none}
/* eat card */
.ec{margin-top:20px}.ec .ph{position:relative;height:200px;border-radius:24px;overflow:hidden;background-size:cover;background-position:center}
.ec .ph.big{height:260px}
.ec .ph.big::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(22,15,8,.74) 0%,rgba(22,15,8,.12) 46%,rgba(22,15,8,0) 66%)}
.wb{position:absolute;z-index:2;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.94);display:grid;place-items:center;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.tag{position:absolute;left:14px;top:14px;z-index:2;height:28px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.94);color:var(--coral-ink);font:600 12px Figtree;display:flex;align-items:center}
.ec .over{position:absolute;left:18px;right:74px;bottom:18px;z-index:2;color:#fff}
.ec .over .t{font:500 26px/1.05 Outfit;letter-spacing:-.025em}.ec .over .m{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:14px;white-space:nowrap;color:#fff}
.ec .t{font:500 20px/1.15 Outfit;letter-spacing:-.015em;margin-top:12px}.ec .m{display:flex;align-items:center;gap:6px;color:var(--mfg);font-size:14px;margin-top:4px}
.ec .o{font:500 13.5px Figtree;color:var(--pos);margin-top:3px}
.dock{position:absolute;left:0;right:0;bottom:0;height:150px;z-index:5;background:linear-gradient(to top,#fff 46%,rgba(255,255,255,0));pointer-events:none}
.ask{z-index:6;position:absolute;left:16px;right:16px;bottom:46px;height:54px;border-radius:27px;background:rgba(246,245,243,.86);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:space-between;padding:0 7px 0 20px;font-size:16px;color:var(--mfg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}
.ask .mic{width:40px;height:40px;border-radius:50%;background:oklch(.935 .005 80);display:grid;place-items:center;color:var(--ink)}
.scrim{position:absolute;inset:0;background:rgba(22,15,8,.42);z-index:20}
/* top sheet (dates and guests) */
.topsheet{position:absolute;z-index:21;left:0;right:0;top:0;background:#fff;border-radius:0 0 34px 34px;padding:59px 0 22px;box-shadow:0 18px 50px -10px rgba(22,15,8,.28)}
.tsh{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:0 16px;height:56px}
.tsh .t{text-align:center;font:600 17px Outfit;letter-spacing:-.01em}.tsh .circ{grid-column:3}
.tsb{padding:6px 16px 0}
.field{background:var(--muted);border-radius:16px;padding:14px 16px}
.field .lab{font:600 11px Figtree;letter-spacing:.2em;text-transform:uppercase;color:var(--mfg)}
.field .val{font:500 20px/1.2 Outfit;letter-spacing:-.02em;margin-top:6px}.field .val.ph{color:var(--mfg)}
.field.row{display:flex;align-items:center;justify-content:space-between}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.step{display:flex;align-items:center;justify-content:space-between;margin-top:8px}.step b{font:500 22px Outfit}
.step .b{width:36px;height:36px;border-radius:50%;background:#fff;display:grid;place-items:center}.step .b .ic{width:16px;height:16px}.step .b.off{opacity:.35}
.done{height:56px;border-radius:999px;background:var(--ink);color:#fff;font:600 15px Figtree;display:flex;align-items:center;justify-content:center;margin-top:16px;box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 2px 6px -1px rgba(30,20,10,.3)}
/* bottom sheet (sort and filter) */
.sheet{position:absolute;z-index:21;left:0;right:0;bottom:0;top:96px;background:#fff;border-radius:34px 34px 0 0;padding:10px 16px 0;box-shadow:0 -10px 40px rgba(22,15,8,.18)}
.grab{width:44px;height:5px;border-radius:3px;background:oklch(.86 .005 80);margin:0 auto 6px}
.sh{display:flex;align-items:baseline;justify-content:space-between;padding:12px 0 14px}.sh .t{font:500 21px Outfit;letter-spacing:-.02em}.sh u{font:600 14px Figtree;color:var(--soft);text-underline-offset:3px}
.grp{margin-bottom:22px}.grp h4{font:600 14px Figtree;margin-bottom:10px}
.pr4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.rowck{display:flex;align-items:center;gap:12px;height:48px;border-radius:16px;background:var(--muted);padding:0 16px;font:400 15px Figtree;margin-bottom:8px}
.ck{width:20px;height:20px;border-radius:5px;border:2px solid var(--ink);flex:none;display:grid;place-items:center}.ck.on{background:var(--ink)}.ck .ic{width:13px;height:13px;color:#fff}
.foot{position:absolute;left:0;right:0;bottom:0;padding:12px 16px 36px;background:#fff}
.foot .done{margin:0}
`;

const header = (right) => `<div class="hdr"><div class="circ">${svg("menu")}</div><div class="city">Montreal ${svg("down")}</div>${right}</div>`;
const bedBtn = `<div class="circ">${svg("bed")}<span class="dot"></span></div>`;
const heartBtn = `<div class="circ">${svg("heart")}</div>`;
const pill = (label, o = {}) => `<span class="chip${o.on ? " on" : ""}">${o.icon ? svg(o.icon) : ""}${label}${o.chev ? svg(o.chev === "up" ? "up" : "down", "opacity:.6") : ""}</span>`;
const ask = (text) => `<div class="dock"></div><div class="ask"><span>${text}</span><span class="mic">${svg("mic")}</span></div>`;
const bg = (u, pos = "center") => `background-image:url(${u});background-position:${pos}`;

const stayCard = (photo, name, rating, count, stars, price, total, pos) => `<div class="sc"><div class="ph" style="${bg(photo, pos)}"></div><div class="l1"><span class="t">${name}</span><span class="pr">${price}</span></div><div class="l2"><span class="m">${star}${rating} · ${count} · ${stars}</span><span class="tot">${total}</span></div></div>`;
const eatCard = ({ photo, name, meta, open, tag, pos }) => `<div class="ec"><div class="ph" style="${bg(photo, pos)}">${tag ? `<span class="tag">${tag}</span>` : ""}<span class="wb" style="right:14px;top:14px">${svg("heart")}</span><span class="wb" style="right:14px;bottom:14px">${svg("plus")}</span></div><div class="t">${name}</div><div class="m">${meta}</div><div class="o">${open}</div></div>`;
const heroCard = ({ photo, name, meta, tag }) => `<div class="ec"><div class="ph big" style="${bg(photo, "center 40%")}"><span class="tag">${tag}</span><span class="wb" style="right:14px;top:14px;z-index:3">${svg("heart")}</span><span class="wb" style="right:14px;bottom:14px;z-index:3">${svg("plus")}</span><div class="over"><div class="t" style="margin:0">${name}</div><div class="m">${meta}</div></div></div></div>`;

const STAY_PILLS = (on = {}) => `<div class="pills">${pill("Filters", { icon: "sliders" })}${pill("Sort: Lowest price", { chev: on.sort ? "up" : "down", on: on.sort })}${pill("Price", { chev: on.price ? "up" : "down", on: on.price })}${pill("Type", { chev: "down" })}${pill("Stars", { chev: "down" })}${pill("Free cancellation")}</div>`;
const stayList = `${stayCard(PH.pool, "M Montreal", "9.2", "3,511", "4-star", "$104", "$312 for 3 nights", "center 60%")}${stayCard(PH.room, "Auberge Saintlo Montréal", "8.8", "1,204", "2-star", "$104", "$313 for 3 nights", "center top")}`;

const SCREENS = [];
SCREENS.push({ id: "09-stay-results", title: "Stay", note: "The place in the header, one row of pills, and the hotels as photographs.", html: `<div class="page">${header(bedBtn)}${STAY_PILLS()}${stayList}${ask("Try “Dec 10–14, 4 stars, under 200”")}</div>` });
SCREENS.push({ id: "10-stay-price-panel", title: "Stay, price", note: "A pill opens its own small panel over the list. Nothing underneath moves.", html: `<div class="page">${header(bedBtn)}${STAY_PILLS({ price: true })}<div class="panel" style="top:152px"><div class="ph"><b>Price per night</b><span class="r"><u>Clear</u><span class="x">${svg("x")}</span></span></div><div style="margin-top:12px;font-size:14px;color:var(--mfg)">Up to $140</div><div class="slider"><i class="tr"></i><i class="th" style="right:46%"></i></div></div>${stayList}${ask("Try “Dec 10–14, 4 stars, under 200”")}</div>` });
SCREENS.push({ id: "11-stay-dates", title: "Stay, dates and guests", note: "The place pill opens one top sheet: where, which nights, how many.", html: `<div class="page">${header(bedBtn)}${STAY_PILLS()}${stayList}<div class="scrim"></div><div class="topsheet"><div class="tsh"><span></span><span class="t">Dates and guests</span><div class="circ">${svg("x")}</div></div><div class="tsb"><div class="field row"><div><div class="lab">Place</div><div class="val">Montreal</div></div>${svg("down", "color:var(--mfg);width:22px;height:22px")}</div><div class="fgrid"><div class="field"><div class="lab">Check-in</div><div class="val">Thu, Nov 26</div></div><div class="field"><div class="lab">Check-out</div><div class="val">Sun, Nov 29</div></div><div class="field"><div class="lab">Guests</div><div class="step"><span class="b">${svg("minus")}</span><b>2</b><span class="b">${svg("plus")}</span></div></div><div class="field"><div class="lab">Rooms</div><div class="step"><span class="b off">${svg("minus")}</span><b>1</b><span class="b">${svg("plus")}</span></div></div></div><div class="done">Done</div></div></div></div>` });

const EAT_PILLS = (on = {}) => `<div class="pills">${pill("Filters", { icon: "sliders" })}${pill("Open now", { on: on.open })}${pill("Sort: Roam’s pick", { chev: "down" })}${pill("Type", { chev: on.cuisine ? "up" : "down", on: on.cuisine })}${pill("Price", { chev: "down" })}${pill("Rating", { chev: "down" })}</div>`;
const eatList = `${heroCard({ photo: PH.joe, name: "Joe Beef", meta: `French · $$$$ · ${star.replace('class="star"', 'class="star" style="fill:#fff"')} 4.5 · 1.2 km`, tag: "Roam’s pick" })}${eatCard({ photo: PH.schwartz, name: "Schwartz’s Deli", meta: `Deli · $$ · ${star} 4.4 · 0.8 km`, open: "Open until 12 AM", pos: "center 40%" })}`;
SCREENS.push({ id: "12-eat-results", title: "Eat", note: "The same bones as Stay: place pill, pills, photographs. Saved places at the right.", html: `<div class="page">${header(heartBtn)}${EAT_PILLS()}${eatList}${ask("Ask Roam about places to eat")}</div>` });
const cuisines = [["Restaurants", true], ["Cafés"], ["Brunch"], ["Street food"], ["Bakeries"], ["Fine dining"], ["Veg / Vegan"], ["Bars"]];
SCREENS.push({ id: "13-eat-cuisine-panel", title: "Eat, type", note: "Choose-many groups tick; the panel floats over the list.", html: `<div class="page">${header(heartBtn)}${EAT_PILLS({ cuisine: true })}<div class="panel" style="top:152px"><div class="ph"><b>Type of place</b><span class="r"><u>Clear</u><span class="x">${svg("x")}</span></span></div><div class="wrap" style="margin-top:14px">${cuisines.map(([c, on]) => `<span class="chip${on ? " on" : ""}">${on ? `<span class="tick">${svg("check")}${c}</span>` : c}</span>`).join("")}</div></div>${eatList}${ask("Ask Roam about places to eat")}</div>` });
SCREENS.push({ id: "14-eat-sheet", title: "Eat, sort and filter", note: "The Filters pill opens everything, laid out like Flights and Stay.", html: `<div class="page">${header(heartBtn)}${EAT_PILLS()}${eatList}<div class="scrim"></div><div class="sheet"><div class="grab"></div><div class="sh"><span class="t">Sort and filter</span><u>Clear all</u></div><div class="grp"><h4>Sort by</h4><div class="grid2"><span class="gc on">Roam’s pick</span><span class="gc">Best rated</span><span class="gc">Lowest price</span></div></div><div class="grp"><h4>Price</h4><div class="pr4"><span class="gc">$</span><span class="gc on">$$</span><span class="gc on">$$$</span><span class="gc">$$$$</span></div></div><div class="grp"><h4>Type of place</h4><div class="wrap">${cuisines.slice(0, 6).map(([c, on]) => `<span class="chip${on ? " on" : ""}">${on ? `<span class="tick">${svg("check")}${c}</span>` : c}</span>`).join("")}</div></div><div class="grp"><div class="rowck"><span class="ck on">${svg("check")}</span>Open now</div></div><div class="foot"><div class="done">Show 24 places</div></div></div></div>` });

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
const catalog = [];
for (const s of SCREENS) {
  const file = join(raw, `${s.id}.html`);
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${s.html}</body></html>`);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(raw, `${s.id}.png`) });
  catalog.push({ id: s.id, title: s.title, note: s.note });
  console.log("rendered", s.id);
}
writeFileSync(join(raw, "catalog-stay-eat.json"), JSON.stringify(catalog, null, 2));
await browser.close();
