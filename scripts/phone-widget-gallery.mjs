// Builds docs/design/widget-renders/gallery.html from manifest.json (made by phone-widget-renders.mjs). Images are linked, not embedded.
//   node scripts/phone-widget-gallery.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = "docs/design/widget-renders";
// manifest.json is the full run; manifest-partial.json (a re-run of a few scenes) replaces those scenes' entries.
const read = (f) => { try { return JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); } catch { return []; } };
const partial = read("manifest-partial.json");
const key = (m) => `${m.scene}|${m.theme}`;
const merged = new Map([...read("manifest.json"), ...partial].map((m) => [key(m), m]));
const order = (scene) => { const n = parseInt(scene, 10); return n * 10 + (scene.replace(/^\d+/, "").charCodeAt(0) || 0) / 1000; };
const manifest = [...merged.values()].sort((a, b) => order(a.scene) - order(b.scene) || a.theme.localeCompare(b.theme));
// A tap that could not be captured is a harness problem, not a widget: keep it out of the gallery but say so on the console.
for (const m of manifest) { const bad = m.shots.filter((s) => s.kind === "failed"); if (bad.length) console.log(`note: ${m.scene} ${m.theme}: ${bad.map((b) => b.title).join(", ")} not captured`); m.shots = m.shots.filter((s) => s.kind !== "failed"); }
// Map sheets need a Mapbox token the offline harness does not have: they would show "map couldn't load", so they are left out.
// (map sheets are kept now that the harness draws real maps)
const byWidget = new Map();
for (const m of manifest) byWidget.set(m.scene, { ...(byWidget.get(m.scene) ?? { title: m.title, themes: {} }), themes: { ...(byWidget.get(m.scene)?.themes ?? {}), [m.theme]: m.shots } });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fig = (shot, theme) => shot.kind === "failed"
  ? `<figure class="miss"><figcaption>${esc(shot.title)}</figcaption><p>Could not capture: ${esc(shot.error)}</p></figure>`
  : `<figure><a href="${shot.full ?? shot.file}" target="_blank"><img loading="lazy" src="${shot.file}" alt="${esc(shot.title)} (${theme})"></a><figcaption>${esc(shot.title)}${shot.full ? ` · <a href="${shot.full}" target="_blank">full length</a>` : ""}</figcaption></figure>`;

const sections = [...byWidget.entries()].map(([scene, w]) => `
<section id="w${scene}">
  <h2>${esc(w.title)}</h2>
  ${Object.entries(w.themes).map(([theme, shots]) => `<div class="row" data-theme="${theme}">${shots.map((s) => fig(s, theme)).join("")}</div>`).join("")}
</section>`).join("\n");

writeFileSync(`${dir}/gallery.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roam widgets, phone renders</title>
<style>
:root{color-scheme:light dark;--bg:#faf8f5;--fg:#1c1815;--mut:#6b645c;--line:#e6e1da}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--fg:#f3efe9;--mut:#a39b91;--line:#2a2622}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
header,section{max-width:1500px;margin:0 auto;padding:24px 20px}
h1{font-size:28px;margin:0 0 6px}h2{font-size:20px;margin:0 0 12px;border-top:1px solid var(--line);padding-top:20px}
p.lede{color:var(--mut);margin:0}
.bar{display:flex;gap:8px;margin-top:14px}.bar button{border:1px solid var(--line);background:none;color:var(--fg);border-radius:999px;padding:6px 14px;cursor:pointer}.bar button[aria-pressed=true]{background:var(--fg);color:var(--bg)}
.row{display:flex;gap:18px;overflow-x:auto;padding:4px 0 16px;align-items:flex-start}
figure{margin:0;flex:0 0 auto;width:260px}figure img{display:block;width:260px;height:auto;border:1px solid var(--line);border-radius:14px;background:#fff}
figcaption{font-size:12px;color:var(--mut);margin-top:6px}figcaption a{color:inherit}
.miss{width:260px;padding:12px;border:1px dashed var(--line);border-radius:14px}
body[data-show=light] .row[data-theme=dark],body[data-show=dark] .row[data-theme=light]{display:none}
</style></head><body data-show="light">
<header><h1>Roam widgets on the phone</h1>
<p class="lede">Light mode. Every widget in the chat, the sheet it opens when tapped, and that sheet's full length (click a picture). Rendered from the real components at 390 px wide with fixture data and the app's own pictures; maps are live Mapbox.</p>
</header>
${sections}
</body></html>`);
console.log(`gallery.html: ${byWidget.size} widgets`);
