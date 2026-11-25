// Designs for two full phone screens that do not exist yet: Flights (search, results) and Restaurants (list, filters), drawn with the app's own
// tokens, fonts and component vocabulary (DESIGN.md, the Stay and Discover screens, the flight widget). Not wired to data: sample fares and places.
//   node scripts/phone-render-flights-restaurants.mjs <assets.json> <outDir>
// assets.json: { places: { "<query>": { name, rating, count, price, photo } }, cities: { "<city>": dataUri }, logos: { AC: dataUri } } (photos as data URIs).
// Output: <outDir>/raw/<id>.png at 393x852 (3x, room left for the status bar and home indicator) + <id>--full.png + catalog.json.
// Frame them with: node scripts/phone-render-compose.mjs <outDir>/raw <outDir> new-screens <outDir>/raw/catalog.json
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const [assetsPath, outDir] = process.argv.slice(2);
if (!assetsPath || !outDir) { console.error("usage: node scripts/phone-render-flights-restaurants.mjs <assets.json> <outDir>"); process.exit(1); }
const A = JSON.parse(readFileSync(assetsPath, "utf8"));
const raw = join(resolve(outDir), "raw");
mkdirSync(raw, { recursive: true });

const media = resolve(".next-dev-4000/static/media");
const face = (n) => readdirSync(media).find((f) => f.startsWith(`${n}-latin.`) && f.endsWith(".woff2"));
const FONTS = `@font-face{font-family:Outfit;font-weight:100 900;src:url("${pathToFileURL(join(media, face("outfit")))}")}@font-face{font-family:Figtree;font-weight:300 900;src:url("${pathToFileURL(join(media, face("figtree")))}")}`;

const I = {
  menu: '<path d="M4 7h16M4 12h11M4 17h14"/>', search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', dots: '<circle cx="5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="19" cy="12" r="1.1"/>', heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>', down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>', mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', swap: '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trend: '<path d="m22 17-8.5-8.5-5 5L2 7M16 17h6v-6"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
};
const svg = (n, style = "") => `<svg class="ic"${style ? ` style="${style}"` : ""} viewBox="0 0 24 24">${I[n]}</svg>`;
const star = '<svg class="star" viewBox="0 0 24 24"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>';

const CSS = `${FONTS}
:root{--surface:oklch(.982 .003 80);--muted:oklch(.967 .004 80);--ink:oklch(.205 .012 65);--soft:oklch(.42 .012 70);--mfg:oklch(.5 .012 72);--hair:oklch(.925 .005 80);--input:oklch(.88 .006 80);
--coral:oklch(.64 .175 36);--coral-ink:oklch(.48 .14 34);--coral-soft:oklch(.962 .025 45);--pos:oklch(.44 .1 158);--pos-dot:oklch(.5 .11 158);--pos-soft:oklch(.962 .022 160);--lag:oklch(.44 .085 225);--lag-soft:oklch(.95 .022 220);--caut:oklch(.46 .1 70);
--shadow-soft:0 1px 2px oklch(.2 .012 65/6%),0 3px 10px -3px oklch(.2 .012 65/7%);--lift:0 1px 2px oklch(.2 .012 65/5%),0 6px 12px -6px oklch(.2 .012 65/9%),0 14px 24px -12px oklch(.2 .012 65/11%)}
*{box-sizing:border-box;margin:0}
html,body{width:393px;background:#fff;font:400 14px/1.4 Figtree,system-ui;color:var(--ink);-webkit-font-smoothing:antialiased}
.page{position:relative;width:393px;min-height:852px;padding:59px 16px 120px;overflow:hidden}
.ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.hdr{display:flex;align-items:center;justify-content:space-between;height:44px;margin-top:8px}
.circ{width:44px;height:44px;border-radius:50%;background:var(--muted);display:grid;place-items:center}
.title{font:600 17px Outfit;letter-spacing:-.01em}
.city{height:44px;padding:0 16px 0 20px;border-radius:999px;background:var(--muted);display:flex;align-items:center;gap:6px;font:600 17px Outfit;letter-spacing:-.01em}
.city .ic{width:16px;height:16px;opacity:.7}
.eyebrow{font:600 11px/16px Figtree;letter-spacing:.12em;text-transform:uppercase;color:var(--mfg)}
.d{font-family:Outfit;letter-spacing:-.02em}
.chip{height:36px;padding:0 15px;border-radius:999px;border:1px solid var(--input);background:#fff;font:500 13.5px Figtree;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none}
.chip .ic{width:14px;height:14px}.chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.chips{display:flex;gap:8px;overflow:hidden;margin:0 -16px;padding:0 16px}
.dock{position:fixed;left:0;right:0;bottom:0;height:150px;z-index:5;background:linear-gradient(to top,#fff 46%,rgba(255,255,255,0));pointer-events:none}
.ask{z-index:6;position:fixed;left:16px;right:16px;bottom:46px;height:54px;border-radius:27px;background:rgba(246,245,243,.86);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:space-between;padding:0 7px 0 20px;font-size:16px;color:var(--mfg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}
.ask .mic{width:40px;height:40px;border-radius:50%;background:oklch(.935 .005 80);display:grid;place-items:center;color:var(--ink)}
.star{width:13px;height:13px;fill:var(--coral);flex:none}
.logo{width:36px;height:36px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.09);display:grid;place-items:center;overflow:hidden;flex:none}.logo img{width:62%;height:62%;object-fit:contain}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none}
/* flights */
.fcard{background:#fff;border:1px solid var(--hair);border-radius:28px;box-shadow:var(--lift);padding:4px 0 10px;overflow:hidden}
.fld{padding:14px 16px 13px;display:flex;align-items:center;justify-content:space-between;position:relative}
.fld .lab{font:600 11px Figtree;letter-spacing:.12em;text-transform:uppercase;color:var(--mfg)}
.fld .val{font:500 26px/1.15 Outfit;letter-spacing:-.02em;margin-top:3px}
.fld .code{font:600 13px Figtree;letter-spacing:.06em;color:var(--mfg);margin-right:46px}
.rule{height:1px;background:var(--hair);margin:0;position:relative}
.swap{position:absolute;right:16px;top:-18px;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid var(--input);display:grid;place-items:center;box-shadow:var(--shadow-soft)}
.swap .ic{width:16px;height:16px}
.cells{display:grid;grid-template-columns:1fr 1fr}
.cell{padding:13px 16px 14px}.cell+.cell{border-left:1px solid var(--hair)}
.cell .v{font:500 18px Outfit;letter-spacing:-.01em;margin-top:3px}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 0;border-top:1px solid var(--hair)}
.seg{display:flex;background:var(--muted);border-radius:999px;padding:3px;height:42px}
.seg span{display:grid;place-items:center;padding:0 16px;border-radius:999px;font:500 13.5px Figtree;color:var(--soft)}
.seg .on{background:#fff;color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(40,26,10,.12),0 0 0 1px rgba(40,26,10,.04)}
.btn{height:54px;border-radius:999px;background:var(--ink);color:#fff;font:500 16px Figtree;display:flex;align-items:center;justify-content:center;gap:9px;margin:12px 12px 2px;box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 2px 6px -1px rgba(30,20,10,.3)}
.btn .ic{width:18px;height:18px}
.sec{font:500 21px Outfit;letter-spacing:-.015em}
.rail{display:flex;gap:10px;margin:12px -16px 0;padding:0 16px;overflow:hidden}
.dest{position:relative;width:150px;height:196px;border-radius:24px;overflow:hidden;flex:none;color:#fff;background-size:cover;background-position:center}
.dest::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(22,15,8,.74),rgba(22,15,8,0) 58%)}
.dest .tx{position:absolute;left:14px;right:12px;bottom:14px;z-index:1}
.dest .n{font:500 20px/1.1 Outfit;letter-spacing:-.015em}.dest .p{font-size:13px;opacity:.9;margin-top:3px}
.sum{display:flex;gap:8px;align-items:center}
.sumpill{flex:1;min-width:0;height:64px;border-radius:999px;border:1px solid var(--input);padding:0 18px 0 22px;display:flex;align-items:center;justify-content:space-between;background:#fff}
.sumpill .a{font:500 18px Outfit;letter-spacing:-.015em}.sumpill .b{font-size:13px;color:var(--mfg);margin-top:1px}
.fbtn{width:56px;height:56px;border-radius:50%;background:var(--muted);display:grid;place-items:center;flex:none}
.insight{display:flex;align-items:center;gap:9px;padding:2px 2px}
.insight .t{font:500 14px Figtree}.insight .u{font-size:14px;color:var(--mfg)}
.win{background:#fff;border:1px solid var(--hair);border-radius:20px;box-shadow:var(--shadow-soft);overflow:hidden}
.win .top{padding:16px}.win .lbl{display:flex;align-items:center;justify-content:space-between}
.win .lbls{display:flex;gap:14px}.win .lbls span{display:inline-flex;align-items:center;gap:6px}
.win .wm{display:flex;align-items:center;gap:12px;margin-top:12px}
.win .nm{flex:1;font:500 15px/1.2 Figtree}
.win .pr{text-align:right}.win .pr b{display:block;font:500 31px/1 Outfit;letter-spacing:-.03em}.win .pr small{display:block;font-size:12px;color:var(--mfg);margin-top:6px}
.stub{border-top:1px solid var(--hair);background:var(--surface);padding:12px 16px}
.tl{display:flex;align-items:center;gap:12px}
.tl .tm{font:500 16px Outfit;white-space:nowrap}.tl sup{font:600 11px Figtree;color:var(--coral-ink);margin-left:2px}
.tl .mid{flex:1;min-width:0}.tl .dur{text-align:center;font-size:12px;color:var(--soft);line-height:18px}
.line{position:relative;height:10px;margin:3px 0}.line i{position:absolute;display:block}
.line .bar{left:0;right:0;top:4px;height:2px;border-radius:2px;background:var(--hair)}
.line .a{left:0;top:1px;width:8px;height:8px;border-radius:50%;background:var(--ink)}
.line .b{right:0;top:1px;width:8px;height:8px;border-radius:50%;border:2px solid var(--ink);background:#fff}
.line .s{top:2px;width:6px;height:6px;border-radius:50%;background:var(--coral);transform:translateX(-50%)}
.codes{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.04em;color:var(--mfg);line-height:18px}
.fr{padding:15px 0;border-bottom:1px solid var(--hair)}
.fr .l1{display:flex;align-items:center;gap:13px}.fr .nm{flex:1;font:500 15px/1.2 Figtree}
.fr .pr{font:500 21px Outfit;letter-spacing:-.015em;display:flex;align-items:center;gap:4px}.fr .pr .ic{width:16px;height:16px;color:var(--mfg)}
.fr .tl{margin-top:11px}.risk{margin-top:9px;display:flex;align-items:center;gap:6px;font:500 12px Figtree;color:var(--caut)}.risk .ic{width:13px;height:13px}
.note{display:flex;gap:9px;align-items:flex-start;font-size:12px;line-height:1.45;color:var(--mfg);margin-top:16px}.note .ic{width:15px;height:15px;margin-top:1px}
/* flights v2: the app's own patterns (map search pill, Stay date row, Directions top sheet) */
.sp{height:44px;min-width:176px;padding:0 22px;border-radius:999px;background:var(--muted);display:flex;align-items:center;justify-content:center;gap:10px;font:600 17px Outfit;letter-spacing:-.01em;color:var(--soft)}
.sp .ic{width:18px;height:18px}
.daterow{display:flex;gap:8px;align-items:center}
.datepill{flex:1;min-width:0;height:64px;border-radius:999px;border:1px solid var(--input);padding:0 20px 0 22px;display:flex;align-items:center;justify-content:space-between;background:#fff}
.datepill .a{font:500 18px Outfit;letter-spacing:-.015em}.datepill .b{font-size:13px;color:var(--mfg);margin-top:1px}
.countrow{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-top:18px}
.topsheet{position:fixed;z-index:21;left:0;right:0;top:0;background:#fff;border-radius:0 0 34px 34px;padding:59px 0 22px;box-shadow:0 18px 50px -10px rgba(22,15,8,.28)}
.tsh{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:0 16px;height:56px}
.tsh .t{text-align:center;font:600 17px Outfit;letter-spacing:-.01em}
.tsb{padding:6px 16px 0}
.inp{background:var(--surface);border-radius:20px;box-shadow:inset 0 0 0 1px var(--hair);padding:0 14px 0 18px}
.inp.focus{background:#fff;box-shadow:0 0 0 2px oklch(.205 .012 65/.78)}
.inp .r{display:flex;align-items:center;gap:13px;height:58px;position:relative}
.inp .r+.r{border-top:1px solid var(--hair)}
.inp .v{flex:1;font:500 17px Figtree}.inp .v.ph{color:var(--mfg);font-weight:400}
.inp .code{font:600 13px Figtree;letter-spacing:.06em;color:var(--mfg)}
.mk{width:12px;height:12px;border-radius:3px;background:var(--ink);flex:none;margin:0 3px 0 0}
.micb{width:40px;height:40px;border-radius:50%;background:oklch(.935 .005 80);display:grid;place-items:center;flex:none}
.hint{font-size:14px;color:var(--soft);margin:12px 4px 0;line-height:1.4}
.pair{display:flex;gap:8px;margin-top:14px}
.sug{margin:8px 0 0}.sug .it{display:flex;align-items:center;gap:14px;padding:11px 4px}
.sug .ico{width:40px;height:40px;border-radius:50%;background:var(--muted);display:grid;place-items:center;flex:none}
.sug .tt{font:500 16px Figtree}.sug .ss{font-size:13px;color:var(--mfg);margin-top:1px}
/* restaurants */
.toggle{display:flex;align-items:center;gap:8px;font:500 13.5px Figtree}
.sw{width:42px;height:26px;border-radius:999px;background:var(--pos-dot);position:relative}.sw::after{content:"";position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.hero{position:relative;height:262px;border-radius:28px;overflow:hidden;color:#fff;background-size:cover;background-position:center}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(22,15,8,.78) 0%,rgba(22,15,8,.18) 48%,rgba(22,15,8,0) 70%)}
.hero .tag{position:absolute;left:14px;top:14px;z-index:2;height:28px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.94);color:var(--coral-ink);font:600 12px Figtree;display:flex;align-items:center}
.wb{position:absolute;z-index:2;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.94);display:grid;place-items:center;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.hero .tx{position:absolute;left:18px;right:74px;bottom:18px;z-index:2}
.hero .n{font:500 28px/1.05 Outfit;letter-spacing:-.025em}.hero .m{display:flex;align-items:center;flex-wrap:nowrap;gap:5px;margin-top:8px;font-size:14px;white-space:nowrap}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px 12px;margin-top:18px}
.pc .ph{position:relative;height:150px;border-radius:22px;overflow:hidden;background-size:cover;background-position:center}
.pc .wb{width:36px;height:36px}
.pc .t{font:600 16px/1.2 Outfit;letter-spacing:-.01em;margin-top:11px}
.pc .m{display:flex;align-items:center;gap:5px;font-size:13px;color:var(--mfg);margin-top:4px;white-space:nowrap}
.pc .o{display:flex;align-items:center;gap:6px;font:500 12.5px Figtree;color:var(--pos);margin-top:5px}.pc .o .dot{background:var(--pos-dot)}
.scrim{position:fixed;inset:0;background:rgba(22,15,8,.42);z-index:20}
.sheet{position:fixed;z-index:21;left:0;right:0;bottom:0;top:206px;background:#fff;border-radius:34px 34px 0 0;padding:10px 16px 0;box-shadow:0 -10px 40px rgba(22,15,8,.18)}
.grab{width:44px;height:5px;border-radius:3px;background:oklch(.86 .005 80);margin:0 auto 6px}
.sh{display:flex;align-items:center;justify-content:space-between;height:56px}.sh .t{font:600 18px Outfit;letter-spacing:-.01em}.sh .rs{font:500 15px Figtree;color:var(--soft);width:44px}
.blk{padding:15px 0 16px;border-bottom:1px solid var(--hair)}.blk:last-of-type{border-bottom:0}
.blk h4{font:500 18px Outfit;letter-spacing:-.01em;margin-bottom:11px}
.wrap{display:flex;flex-wrap:wrap;gap:8px}
.price4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.price4 span{height:44px;border-radius:14px;border:1px solid var(--input);display:grid;place-items:center;font:500 15px Figtree}.price4 .on{background:var(--ink);color:#fff;border-color:var(--ink)}
.foot{position:absolute;left:0;right:0;bottom:0;padding:12px 16px 40px;background:#fff;border-top:1px solid var(--hair)}
.foot .clr{font:500 15px Figtree;text-decoration:underline;text-underline-offset:3px;padding:0 6px}.foot .btn{margin:0}
`;

const bg = (u) => (u ? `background-image:url(${u})` : "background:#e9e4dc");
const P = (q) => A.places[q] ?? {};
const price = (l) => ({ PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" })[l] ?? "$$";
const header = (mid, right = "heart") => `<div class="hdr"><div class="circ">${svg("menu")}</div>${mid}<div class="circ">${svg(right)}</div></div>`;
const dock = (text) => `<div class="dock"></div><div class="ask"><span>${text}</span><span class="mic">${svg("mic")}</span></div>`;
const logo = (c) => `<span class="logo"><img src="${A.logos[c] ?? ""}"></span>`;
const timeline = (dep, arr, plus, dur, stops, a, b, via) => `<div class="tl"><span class="tm">${dep}</span><div class="mid"><div class="dur">${dur} · ${stops}</div><div class="line"><i class="bar"></i><i class="a"></i>${via ? '<i class="s" style="left:50%"></i>' : ""}<i class="b"></i></div><div class="codes"><span>${a}</span>${via ? `<span>via ${via}</span>` : ""}<span>${b}</span></div></div><span class="tm">${arr}${plus ? `<sup>+${plus}</sup>` : ""}</span></div>`;
const frow = (c, name, pr, dep, arr, plus, dur, stops, via, risk) => `<div class="fr"><div class="l1">${logo(c)}<span class="nm">${name}</span><span class="pr">${pr}${svg("right")}</span></div>${timeline(dep, arr, plus, dur, stops, "YYZ", "CDG", via)}${risk ? `<div class="risk">${svg("clock")}${risk}</div>` : ""}</div>`;

const SCREENS = [];

// 1. Flights, search. One card, flat inside; the page is a single question and one way to answer it.
SCREENS.push({ id: "01-flights-search", title: "Flights", note: "Where, when and who, in one calm card.", html: `<div class="page">
${header('<span class="title">Flights</span>', "dots")}
<div class="d" style="font-weight:500;font-size:44px;line-height:1.02;margin-top:26px;letter-spacing:-.035em">Where to?</div>
<div class="fcard" style="margin-top:20px">
 <div class="fld"><div><div class="lab">From</div><div class="val">Toronto</div></div><span class="code">YYZ</span></div>
 <div class="rule"><span class="swap">${svg("swap")}</span></div>
 <div class="fld"><div><div class="lab">To</div><div class="val">Paris</div></div><span class="code">CDG</span></div>
 <div class="rule"></div>
 <div class="cells"><div class="cell"><div class="lab eyebrow" style="font-size:10.5px">Depart</div><div class="v">Thu, Dec 31</div></div><div class="cell"><div class="lab eyebrow" style="font-size:10.5px">Return</div><div class="v">Sun, Jan 10</div></div></div>
 <div class="row"><div class="seg"><span class="on">Round trip</span><span>One way</span></div><span class="chip" style="height:42px">${svg("user")}1 adult${svg("down")}</span></div>
 <div class="btn">Search flights</div>
</div>
<div class="sec" style="margin-top:28px">Popular from Toronto</div>
<div class="rail">${[["Lisbon, Portugal", "Lisbon", "from CA$489"], ["Tokyo, Japan", "Tokyo", "from CA$1,046"], ["Mexico City, Mexico", "Mexico City", "from CA$412"], ["Reykjavik, Iceland", "Reykjavik", "from CA$538"]].map(([k, n, p]) => `<div class="dest" style="${bg(A.cities[k])}"><div class="tx"><div class="n">${n}</div><div class="p">${p}</div></div></div>`).join("")}</div>
${dock("Ask Roam about flights")}</div>` });

// 2. Flights, results. The best fare first, every time and stop visible; nothing that repeats the search or the card.
SCREENS.push({ id: "02-flights-results", title: "Flight results", note: "The best fare first, with every time and stop in the open.", html: `<div class="page">
${header('<span class="title">Flights</span>', "dots")}
<div class="sumpill" style="margin-top:12px"><div><div class="a">Toronto to Paris</div><div class="b">Dec 31 – Jan 10 · 1 traveller</div></div>${svg("down")}</div>
<div class="chips" style="margin-top:14px"><span class="chip on">${svg("check")}Nonstop</span><span class="chip">Airlines${svg("down")}</span><span class="chip">Times${svg("down")}</span><span class="chip">Price${svg("down")}</span></div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px"><span class="insight">${svg("trend", "color:var(--lag)")}<span class="t">Low for these dates</span></span><span class="u" style="font-size:14px;color:var(--mfg)">usually CA$690–960</span></div>
<div class="win" style="margin-top:12px"><div class="top"><div class="lbl"><div class="lbls"><span class="eyebrow"><i class="dot" style="background:var(--pos-dot)"></i>Cheapest</span><span class="eyebrow"><i class="dot" style="background:var(--lag)"></i>Fastest</span></div>${svg("right", "color:var(--mfg);width:18px;height:18px")}</div>
<div class="wm">${logo("AC")}<span class="nm">Air Canada</span><span class="pr"><b>CA$639</b><small>round trip · per person</small></span></div></div>
<div class="stub">${timeline("9:55 PM", "11:05 AM", 1, "7h 10m", "nonstop", "YYZ", "CDG", null)}</div></div>
<div style="margin-top:6px">
${frow("AC", "Air Canada · Lufthansa", "CA$655", "6:15 PM", "9:20 AM", 1, "11h 05m", "1 stop", "FRA", "Long layover: 3h 40m")}
${frow("TS", "Air Transat", "CA$712", "8:40 PM", "10:10 AM", 1, "7h 30m", "nonstop", null, null)}
${frow("AF", "Air France", "CA$748", "7:25 PM", "8:45 AM", 1, "7h 20m", "nonstop", null, null)}</div>
<div class="btn" style="margin:20px 0 0">See all 24 flights</div>
<div class="note">${svg("info")}<span>Prices are per person, in CAD, and change quickly. Roam can’t book flights.</span></div>
${dock("Ask about these flights")}</div>` });

// 3. Restaurants, list. Discover's own vocabulary; the one new idea is the hour: what is open now.
const card = (q, meta, open) => { const p = P(q); return `<div class="pc"><div class="ph" style="${bg(p.photo2 || p.photo)}"><span class="wb" style="right:10px;top:10px">${svg("heart", "width:18px;height:18px")}</span><span class="wb" style="right:10px;bottom:10px">${svg("plus", "width:18px;height:18px")}</span></div><div class="t">${p.name ?? q}</div><div class="m">${meta} · ${price(p.price)} ${star}<b style="font-weight:600;color:var(--ink)">${p.rating ?? "4.5"}</b></div><div class="o"><i class="dot"></i>${open}</div></div>`; };
const joe = P("Joe Beef Montreal");
SCREENS.push({ id: "03-restaurants", title: "Restaurants", note: "Where to eat, with what's open right now.", html: `<div class="page">
${header(`<span class="city">Montreal ${svg("down")}</span>`)}
<div class="chips" style="margin-top:14px"><span class="chip" style="gap:8px"><i class="dot" style="background:var(--pos-dot)"></i>Open now</span><span class="chip on">All</span><span class="chip">Brunch</span><span class="chip">Dinner</span><span class="chip">Late night</span></div>
<div class="hero" style="margin-top:16px;${bg(joe.photo)}"><span class="tag">Roam’s pick</span><span class="wb" style="right:14px;top:14px">${svg("heart")}</span><div class="tx"><div class="n">Joe Beef</div><div class="m">French · ${price(joe.price)} ${star}<b style="font-weight:600">${joe.rating}</b></div></div><span class="wb" style="right:14px;bottom:14px">${svg("plus")}</span></div>
<div class="grid2">${card("Olive et Gourmando", "Café", "Open until 4 PM")}${card("Schwartz's Montreal Hebrew Delicatessen", "Deli", "Open until 12 AM")}${card("Dieu du Ciel! Brasserie Montreal", "Brewpub", "Open until 1 AM")}${card("Bouillon Bilk Montreal", "French", "Opens at 5 PM")}</div>
${dock("Ask Roam about places to eat")}</div>` });

// 4. Restaurants, filters. Only what changes the list: cuisine, price, hours, rating.
const chipsHtml = (items) => items.map(([t, on]) => `<span class="chip${on ? " on" : ""}">${t}</span>`).join("");
SCREENS.push({ id: "04-restaurants-filters", title: "Restaurant filters", note: "Cuisine, price, hours and rating, in one sheet.", html: `<div class="page" style="height:852px">
${header(`<span class="city">Montreal ${svg("down")}</span>`)}
<div class="chips" style="margin-top:14px"><span class="chip">Open now</span><span class="chip on">All</span><span class="chip">Brunch</span></div>
<div class="hero" style="margin-top:16px;${bg(joe.photo)}"></div>
<div class="scrim"></div>
<div class="sheet"><div class="grab"></div><div class="sh"><span class="rs">Reset</span><span class="t">Filters</span><span class="circ">${svg("x")}</span></div>
<div class="blk"><h4>Cuisine</h4><div class="wrap">${chipsHtml([["French", 1], ["Bagels", 0], ["Smoked meat", 1], ["Pizza", 0], ["Vegetarian", 0], ["Seafood", 0]])}</div></div>
<div class="blk"><h4>Price</h4><div class="price4"><span>$</span><span class="on">$$</span><span class="on">$$$</span><span>$$$$</span></div></div>
<div class="blk" style="display:flex;align-items:center;justify-content:space-between"><h4 style="margin:0">Open now</h4><span class="sw"></span></div>
<div class="blk"><h4>Rating</h4><div class="wrap">${chipsHtml([["Any", 0], ["4.0+", 1], ["4.5+", 0]])}</div></div>
<div class="foot"><div class="btn">Show 38 places</div></div></div></div>` });

// ---- Flights v2: the search lives in a top sheet that a header pill opens, like Stay's place and the map's directions.
const popular = [["Lisbon, Portugal", "Lisbon", "from CA$489"], ["Tokyo, Japan", "Tokyo", "from CA$1,046"], ["Mexico City, Mexico", "Mexico City", "from CA$412"], ["Paris, France", "Paris", "from CA$639"]];
const popGrid = `<div class="grid2" style="margin-top:12px">${popular.map(([k, n, pr]) => `<div class="dest" style="width:auto;height:190px;${bg(A.cities[k])}"><div class="tx"><div class="n">${n}</div><div class="p">${pr}</div></div></div>`).join("")}</div>`;
const startPage = (extra = "") => `<div class="page">
${header(`<span class="sp">${svg("search")}Where to?</span>`, "plane")}
<div class="daterow" style="margin-top:14px"><div class="datepill"><div><div class="a">Choose your dates</div><div class="b">1 traveller · Economy</div></div>${svg("down")}</div><div class="fbtn">${svg("sliders")}</div></div>
<div class="sec" style="margin-top:26px">Popular from Toronto</div>
${popGrid}
${dock("Ask Roam about flights")}${extra}</div>`;

SCREENS.push({ id: "05-flights-v2-start", title: "Flights", note: "The page opens quiet: a search pill, your dates, and where people go.", html: startPage() });

const sheetHead = '<div class="tsh"><span></span><span class="t">Flights</span><span class="circ">' + svg("x") + "</span></div>";
SCREENS.push({ id: "06-flights-v2-sheet", title: "Flights, the search", note: "Tap the pill: where, when and who drop in from the top.", html: startPage(`<div class="scrim"></div><div class="topsheet">${sheetHead}<div class="tsb">
<div class="inp"><div class="r"><i class="mk"></i><span class="v">Toronto</span><span class="code">YYZ</span></div><div class="r">${svg("pin", "color:var(--soft);width:18px;height:18px")}<span class="v ph">Where to?</span><span class="micb">${svg("mic")}</span></div></div>
<div class="hint">Or say it all, like “Toronto to Paris, Dec 31 to Jan 10”.</div>
<div class="pair"><span class="chip" style="height:48px;flex:1;justify-content:space-between;padding:0 16px">${svg("cal")}<span style="flex:1;text-align:left;font-size:14.5px">Add dates</span>${svg("down")}</span><span class="chip" style="height:48px;flex:1;justify-content:space-between;padding:0 16px">${svg("user")}<span style="flex:1;text-align:left;font-size:14.5px">1 · Economy</span>${svg("down")}</span></div>
<div class="btn" style="margin:14px 0 0;opacity:.35">Search flights</div></div></div>`) });

const sug = (ic, t, sub) => `<div class="it"><span class="ico">${svg(ic, "width:18px;height:18px")}</span><div><div class="tt">${t}</div><div class="ss">${sub}</div></div></div>`;
SCREENS.push({ id: "07-flights-v2-typing", title: "Flights, as you type", note: "Cities and airports, the way the place search already works.", html: startPage(`<div class="scrim"></div><div class="topsheet">${sheetHead}<div class="tsb">
<div class="inp"><div class="r"><i class="mk"></i><span class="v">Toronto</span><span class="code">YYZ</span></div></div>
<div class="inp focus" style="margin-top:10px"><div class="r">${svg("pin", "color:var(--ink);width:18px;height:18px")}<span class="v">Par<span style="display:inline-block;width:1.5px;height:20px;background:var(--coral);vertical-align:-4px;margin-left:1px"></span></span><span class="micb">${svg("mic")}</span></div></div>
<div class="sug">${sug("pin", "Paris, France", "All airports · PAR")}${sug("plane", "Charles de Gaulle", "Paris · CDG")}${sug("plane", "Orly", "Paris · ORY")}${sug("plane", "Beauvais", "Paris · BVA")}</div></div></div>`) });

SCREENS.push({ id: "08-flights-v2-results", title: "Flight results", note: "Same date row as Stay, so the search is one tap away.", html: `<div class="page">
${header('<span class="city">Toronto to Paris ' + svg("down") + "</span>", "plane")}
<div class="daterow" style="margin-top:14px"><div class="datepill"><div><div class="a">Dec 31 – Jan 10</div><div class="b">1 traveller · Economy</div></div>${svg("down")}</div><div class="fbtn">${svg("sliders")}</div></div>
<div class="countrow"><span><b style="font-weight:600">24</b> flights</span><span style="color:var(--soft);display:flex;align-items:center;gap:4px">Cheapest first ${svg("down", "width:16px;height:16px")}</span></div>
<div class="win" style="margin-top:12px"><div class="top"><div class="lbl"><div class="lbls"><span class="eyebrow"><i class="dot" style="background:var(--pos-dot)"></i>Cheapest</span><span class="eyebrow"><i class="dot" style="background:var(--lag)"></i>Fastest</span></div>${svg("right", "color:var(--mfg);width:18px;height:18px")}</div>
<div class="wm">${logo("AC")}<span class="nm">Air Canada</span><span class="pr"><b>CA$639</b><small>round trip · per person</small></span></div></div>
<div class="stub">${timeline("9:55 PM", "11:05 AM", 1, "7h 10m", "nonstop", "YYZ", "CDG", null)}</div></div>
<div class="insight" style="margin-top:14px">${svg("trend", "color:var(--lag)")}<span class="t">Low for these dates</span><span class="u" style="margin-left:auto">usually CA$690–960</span></div>
<div style="margin-top:2px">
${frow("AC", "Air Canada · Lufthansa", "CA$655", "6:15 PM", "9:20 AM", 1, "11h 05m", "1 stop", "FRA", "Long layover: 3h 40m")}
${frow("TS", "Air Transat", "CA$712", "8:40 PM", "10:10 AM", 1, "7h 30m", "nonstop", null, null)}</div>
${dock("Ask about these flights")}</div>` });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const catalog = [];
for (const s of SCREENS) {
  const page = await ctx.newPage();
  writeFileSync(join(raw, `${s.id}.html`), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=393,initial-scale=1"><style>${CSS}</style>${s.html}`);
  await page.goto(pathToFileURL(join(raw, `${s.id}.html`)).href);
  await page.waitForFunction(() => document.fonts.ready.then(() => [...document.images].every((i) => i.complete)));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(raw, `${s.id}.png`) });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  if (h > 860) await page.screenshot({ path: join(raw, `${s.id}--full.png`), fullPage: true });
  catalog.push({ id: s.id, title: s.title, note: s.note, eyebrow: "Phone · new" });
  console.log(`${s.id}: ${h}px`);
  await page.close();
}
writeFileSync(join(raw, "catalog.json"), JSON.stringify(catalog, null, 1));
writeFileSync(join(raw, "catalog-flights-v2.json"), JSON.stringify(catalog.filter((c) => /^0[5-8]/.test(c.id)), null, 1));
await browser.close();
