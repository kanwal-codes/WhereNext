// Helpers for scripts/phone-widget-renders.mjs: freeze the rendered widgets as REAL DOM (not pictures) and build one self-contained
// HTML document from them (docs/design/widget-renders/widgets.html), so every element can be picked, inspected and talked about.
//
// How it stays faithful: the app's CSS is captured once with every @media rule already decided for a 390 px phone (matching rules are
// unwrapped, the others dropped), viewport units (vh/vw) become variables set per frame, and each frame is a transformed box, so
// `position: fixed` sheets lay out inside it. Fonts and pictures are embedded; map canvases become pictures.

/** Hash of an image URL, used as its key in the shared picture table. */
const HASH = `(s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return "h" + h.toString(36); }`;

/** The pictures used so far: key -> data URI. Shared by every state of a run. */
export const makeRegistry = () => ({ imgs: new Map(), sheets: new Map(), started: false, htmlAttrs: "", bodyClass: "", bodyStyle: "" });

/** Capture the page's stylesheets as one string for a 390 px phone, with fonts and images embedded. Once per run. */
async function captureCss(page, known) {
  return page.evaluate(async (known) => {
    // Viewport units become per-frame variables (a frame is not the window). Only in values, never in selectors (h-[46vh] is a class name).
    const fix = (t) => t.replace(/(-?[\d.]+)(?:d|s|l)?vh\b/g, (m, n) => `calc(${n} * var(--fh) / 100)`).replace(/(-?[\d.]+)vw\b/g, (m, n) => `calc(${n} * var(--fw) / 100)`);
    const kids = (r) => [...r.cssRules].map(ser).join("");
    const ser = (r) => {
      if (r instanceof CSSMediaRule) return matchMedia(r.conditionText ?? r.media.mediaText).matches ? kids(r) : "";
      if (r instanceof CSSSupportsRule) return `@supports ${r.conditionText}{${kids(r)}}`;
      if (typeof CSSLayerBlockRule !== "undefined" && r instanceof CSSLayerBlockRule) return `@layer ${r.name}{${kids(r)}}`;
      if (typeof CSSContainerRule !== "undefined" && r instanceof CSSContainerRule) return `@container ${r.conditionText}{${kids(r)}}`;
      if (typeof CSSNestedDeclarations !== "undefined" && r instanceof CSSNestedDeclarations) return fix(r.style.cssText) + ";";
      if (r instanceof CSSStyleRule) return `${r.selectorText}{${fix(r.style.cssText)};${kids(r)}}`;
      return fix(r.cssText);
    };
    const cache = new Map();
    const dataUri = (u) => {
      if (!cache.has(u)) cache.set(u, fetch(u).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(u)))).then((b) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); })).catch(() => u));
      return cache.get(u);
    };
    const out = {};
    for (const sheet of document.styleSheets) {
      // Some sheets (the map's) only arrive when their widget is opened, so every snapshot looks for new ones.
      const key = sheet.href || `inline:${sheet.ownerNode?.textContent?.length}:${(sheet.ownerNode?.textContent || "").slice(0, 60)}`;
      let n = 0; try { n = sheet.cssRules.length; } catch { continue; }
      // In dev the one stylesheet grows as widgets load, so a sheet is taken again when it has more rules than the copy we hold.
      if ((known[key] ?? -1) >= n) continue;
      let text = "";
      try { text = [...sheet.cssRules].map(ser).join("\n"); } catch { continue; }
      const base = sheet.href || location.href;
      const urls = new Set();
      text.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => { if (!u.startsWith("data:") && !u.startsWith("#")) urls.add(u); return m; });
      const map = new Map();
      await Promise.all([...urls].map(async (u) => map.set(u, await dataUri(new URL(u, base).href))));
      text = text.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => (map.has(u) ? `url("${map.get(u)}")` : m));
      out[key] = { n, text };
    }
    return out;
  }, known);
}

/** Fetch pictures in the page (same origin, blob: urls too) and shrink big photos so the document stays a sensible size. */
async function fetchImages(page, urls) {
  return page.evaluate(async (urls) => {
    const out = {};
    await Promise.all(urls.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.blob();
        const read = (blob) => new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
        if (/svg|gif/.test(b.type) || b.size < 60000) { out[u] = await read(b); return; }
        const bmp = await createImageBitmap(b);
        const s = Math.min(1, 720 / bmp.width);
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        out[u] = c.toDataURL(b.type === "image/png" ? "image/png" : "image/jpeg", 0.84);
      } catch { out[u] = null; }
    }));
    return out;
  }, urls);
}

/**
 * Freeze the current page. mode: "card" = just the chat message (the header and the rest of the page pruned away),
 * "sheet" = the whole page (the sheet is a fixed overlay), "page" = whole page without the fixed header, scrolled as it is.
 */
export async function snapshot(page, reg, mode) {
  for (const [k, t] of Object.entries(await captureCss(page, Object.fromEntries([...reg.sheets].map(([k, v]) => [k, v.n]))))) reg.sheets.set(k, t);
  if (!reg.started) {
    reg.started = true;
    reg.htmlAttrs = await page.evaluate(() => [...document.documentElement.attributes].filter((a) => a.name !== "class" || !/\bdark\b/.test(a.value)).map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" "));
    const b = await page.evaluate(() => ({ cls: document.body.className, style: document.body.getAttribute("style") || "" }));
    reg.bodyClass = b.cls; reg.bodyStyle = b.style;
  }
  // Map canvases cannot be copied as DOM: take a picture of the canvas alone (its controls and pins are DOM and stay).
  await page.addStyleTag({ content: "html.gx-cv .mapboxgl-map *:not(canvas){visibility:hidden!important} html.gx-cv canvas{visibility:visible!important}" });
  const n = await page.evaluate(() => { const cs = [...document.querySelectorAll("canvas")].filter((c) => c.getBoundingClientRect().width > 8); cs.forEach((c, i) => c.setAttribute("data-gx-cv", String(i))); return cs.length; });
  const canvases = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => document.documentElement.classList.add("gx-cv"));
    const buf = await page.locator(`canvas[data-gx-cv="${i}"]`).screenshot({ type: "jpeg", quality: 86 }).catch(() => null);
    await page.evaluate(() => document.documentElement.classList.remove("gx-cv"));
    canvases.push(buf ? `data:image/jpeg;base64,${buf.toString("base64")}` : null);
  }
  const snap = await page.evaluate(({ mode, canvases, hash }) => {
    const H = eval(hash);
    const live = document.body;
    const body = live.cloneNode(true);
    const urls = {};
    // Pictures: point each <img> at the shared table, by key.
    const liveImgs = [...live.querySelectorAll("img")];
    [...body.querySelectorAll("img")].forEach((img, i) => {
      const src = liveImgs[i]?.currentSrc || liveImgs[i]?.src || img.getAttribute("src") || "";
      img.removeAttribute("srcset"); img.removeAttribute("sizes"); img.removeAttribute("loading"); img.removeAttribute("fetchpriority");
      if (!src || src.startsWith("data:")) return;
      // blob: pictures (the route maps) are revoked once shown, so copy the decoded bitmap instead of fetching.
      if (src.startsWith("blob:") && liveImgs[i].naturalWidth) {
        const c = document.createElement("canvas"); c.width = liveImgs[i].naturalWidth; c.height = liveImgs[i].naturalHeight;
        c.getContext("2d").drawImage(liveImgs[i], 0, 0);
        img.setAttribute("src", c.toDataURL("image/jpeg", 0.86));
        return;
      }
      const abs = new URL(src, location.href).href;
      const k = H(abs); urls[k] = abs;
      img.removeAttribute("src"); img.setAttribute("data-k", k);
    });
    body.querySelectorAll("picture source").forEach((s) => s.remove());
    body.querySelectorAll("[style*='url(']").forEach((el) => {
      el.setAttribute("style", el.getAttribute("style").replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => {
        if (u.startsWith("data:")) return m;
        const abs = new URL(u, location.href).href; const k = H(abs); urls[k] = abs; return `url(@@${k}@@)`;
      }));
    });
    // Canvases -> pictures.
    body.querySelectorAll("canvas[data-gx-cv]").forEach((c) => {
      const uri = canvases[Number(c.getAttribute("data-gx-cv"))];
      const r = document.querySelector(`canvas[data-gx-cv="${c.getAttribute("data-gx-cv")}"]`).getBoundingClientRect();
      const img = document.createElement("img");
      img.className = c.className; img.setAttribute("alt", ""); if (uri) img.setAttribute("src", uri);
      img.setAttribute("style", `width:${r.width}px;height:${r.height}px;${c.getAttribute("style") || ""}`);
      c.replaceWith(img);
    });
    body.querySelectorAll("script,noscript,style,link,meta,nextjs-portal,next-route-announcer,template").forEach((e) => e.remove());
    let height = innerHeight;
    if (mode === "card") {
      const section = body.querySelector("[data-scene]");
      let node = section;
      while (node && node !== body) { [...node.parentElement.children].forEach((s) => { if (s !== node) s.remove(); }); node = node.parentElement; }
      const wrap = section.parentElement.parentElement;
      section.parentElement.style.paddingTop = "16px";
      const liveSection = live.querySelector("[data-scene]");
      height = Math.ceil(liveSection.getBoundingClientRect().height) + 32;
      if (wrap && wrap !== body) wrap.style.minHeight = "0";
    } else if (mode === "page") {
      body.querySelectorAll("[data-live-header]").forEach((h) => h.remove());
      const y = scrollY;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `transform:translateY(-${y}px);position:relative`;
      while (body.firstChild) wrapper.appendChild(body.firstChild);
      body.appendChild(wrapper);
    }
    body.querySelectorAll("[data-gx-cv]").forEach((e) => e.removeAttribute("data-gx-cv"));
    return { html: body.innerHTML, urls, height, bg: getComputedStyle(live).backgroundColor };
  }, { mode, canvases, hash: HASH });
  const missing = Object.entries(snap.urls).filter(([k]) => !reg.imgs.has(k)).map(([, u]) => u);
  if (missing.length) {
    const got = await fetchImages(page, missing);
    for (const [k, u] of Object.entries(snap.urls)) if (!reg.imgs.has(k)) { reg.imgs.set(k, got[u] ?? null); if (!got[u]) console.log(`  (picture not embedded: ${u.slice(0, 90)})`); }
  }
  return { html: snap.html, height: snap.height, bg: snap.bg };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Build the one-file document from the captured states (see phone-widget-renders.mjs for their shape). */
export function buildDocument(widgets, reg) {
  const used = new Set();
  const fill = (html) => html.replace(/@@(h[0-9a-z]+)@@/g, (m, k) => (reg.imgs.get(k) ?? "")).replace(/data-k="(h[0-9a-z]+)"/g, (m, k) => { used.add(k); return m; });
  const sections = widgets.map((w) => `
<section class="gx-sec" id="w${esc(w.scene)}">
  <h2 class="gx-h2">${esc(w.title)}</h2>
  <div class="gx-row">${w.states.map((s) => `
    <figure class="gx-fig">
      <div class="gx-frame ${esc(reg.bodyClass)}" style="--fw:390px;--fh:${s.height}px;height:${s.height}px;background-color:${s.bg};${esc(reg.bodyStyle)}" data-state="${esc(w.name)}--${esc(s.name)}">${fill(s.html)}</div>
      <figcaption class="gx-cap">${esc(s.title)}</figcaption>
    </figure>`).join("")}
  </div>
</section>`).join("\n");
  const imgs = {}; for (const k of used) if (reg.imgs.get(k)) imgs[k] = reg.imgs.get(k);
  const nav = widgets.map((w) => `<a class="gx-chip" href="#w${esc(w.scene)}">${esc(w.title)}</a>`).join("");
  return `<!doctype html>
<html ${reg.htmlAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roam widgets, phone</title>
<style>${[...reg.sheets.values()].map((v) => v.text).join("\n")}</style>
<style>
html,body{height:auto!important;min-height:0!important;overflow:auto!important;background:#efece6!important}
body{display:block!important;padding:0!important;margin:0!important}
.gx-head{max-width:1700px;margin:0 auto;padding:28px 24px 8px;font:15px/1.5 system-ui,sans-serif;color:#1c1815}
.gx-title{font-size:28px;line-height:1.2;font-weight:600;margin:0 0 6px}
.gx-lede{margin:0;color:#6b645c;max-width:70ch}
.gx-nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.gx-chip{font:13px/1 system-ui,sans-serif;color:#1c1815;text-decoration:none;border:1px solid #d9d3ca;border-radius:999px;padding:7px 12px;background:#faf8f5}
.gx-sec{max-width:1700px;margin:0 auto;padding:8px 24px 20px}
.gx-h2{font:600 19px/1.3 system-ui,sans-serif;color:#1c1815;margin:22px 0 12px;padding-top:18px;border-top:1px solid #d9d3ca}
.gx-row{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
.gx-fig{margin:0;width:390px}
.gx-frame{position:relative;width:390px;overflow:hidden;transform:translateZ(0);isolation:isolate;border-radius:26px;box-shadow:0 0 0 1px #d9d3ca,0 12px 32px rgba(40,30,20,.10);display:block!important;min-height:0!important}
.gx-cap{font:12px/1.4 system-ui,sans-serif;color:#6b645c;margin-top:8px}
</style></head>
<body>
<header class="gx-head"><h1 class="gx-title">Roam widgets on the phone</h1>
<p class="gx-lede">Light mode, 390 px wide. Real markup and styles from the app, not pictures: pick any element. Each widget shows how it sits in the chat, the sheet it opens when tapped, and that sheet at full length. Maps are live Mapbox, frozen as pictures.</p>
<nav class="gx-nav">${nav}</nav></header>
${sections}
<script>
const IMGS=${JSON.stringify(imgs)};
document.querySelectorAll("img[data-k]").forEach((i)=>{const u=IMGS[i.dataset.k];if(u)i.src=u;});
// A frozen page: links and buttons do nothing.
document.addEventListener("click",(e)=>{if(e.target.closest(".gx-frame")&&e.target.closest("a[href],button"))e.preventDefault();},true);
</script>
</body></html>`;
}
