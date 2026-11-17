// Renders every overlay frame (transparent PNG, 1920x1080, 30fps) deterministically from timeline.mjs.
// Opaque scenes (chaos opener, question card, payoff, end card) are drawn here too.
import { chromium } from "../../node_modules/playwright-core/index.mjs";
import { mkdirSync, rmSync, symlinkSync, copyFileSync, existsSync } from "node:fs";
import { CAPTIONS, STOPWATCH, FLASHES, TOTAL, FPS } from "./timeline.mjs";

const exe = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const only = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null; // debug: render just these seconds
const browser = await chromium.launch({ executablePath: exe, args: ["--force-device-scale-factor=1.3333", "--window-size=1440,810"] });
const page = await (await browser.newContext({ viewport: null })).newPage();
await page.goto("http://localhost:4000/sign-in", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

await page.evaluate(({ CAPTIONS, STOPWATCH, FLASHES }) => {
  document.documentElement.style.background = "transparent"; document.body.style.background = "transparent";
  [...document.body.children].forEach(c => (c.style.display = "none"));
  const st = document.createElement("style");
  st.textContent = `
  :root{--ink:oklch(0.205 0.012 65);--coral:oklch(0.64 0.175 36);--coral-ink:oklch(0.55 0.16 35);--bg:oklch(0.982 0.003 80);--soft:oklch(0.42 0.012 70);--hair:oklch(0.925 0.005 80)}
  #ov{position:fixed;inset:0;overflow:hidden;font-family:var(--font-sans),Figtree,sans-serif;color:var(--ink)}
  #ov *{box-sizing:border-box}
  .scene{position:absolute;inset:0;background:var(--bg);display:none}
  .abs{position:absolute}
  .disp{font-family:var(--font-display),Outfit,sans-serif;font-weight:500;letter-spacing:-.035em}
  .coral{color:var(--coral)}
  #chatcard{left:80px;top:215px;width:560px;height:520px;background:#fff;border-radius:26px;box-shadow:0 20px 60px rgb(40 30 20/.12),0 0 0 1px var(--hair);overflow:hidden}
  #chathead{height:64px;border-bottom:1px solid var(--hair);padding:0 22px;display:flex;align-items:center;justify-content:space-between;font:600 20px var(--font-display),Outfit,sans-serif}
  #unread{background:var(--coral);color:#fff;border-radius:999px;padding:4px 14px;font:600 15px var(--font-sans),Figtree,sans-serif}
  #msgs{position:absolute;left:0;right:0;top:64px;bottom:0;padding:16px 20px;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;overflow:hidden}
  .msg{max-width:430px}
  .msg .who{font:600 12px var(--font-sans),Figtree,sans-serif;margin:0 0 3px 12px;letter-spacing:.02em}
  .msg .b{background:oklch(0.967 0.004 80);border-radius:18px;padding:10px 16px;font-size:18px;line-height:1.3}
  #tabspanel{left:700px;top:215px;width:660px;height:520px;overflow:hidden}
  #tabshead{display:flex;align-items:baseline;gap:14px;margin-bottom:18px}
  #tabcount{font-size:84px;line-height:1;color:var(--coral)}
  #tabswrap{display:flex;flex-wrap:wrap;gap:9px}
  .tab{background:#fff;border:1px solid var(--hair);border-radius:12px;padding:8px 14px 8px 12px;font-size:15px;white-space:nowrap;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgb(40 30 20/.05)}
  .tab i{width:10px;height:10px;border-radius:50%;display:block}
  #cap{position:absolute;left:40px;bottom:40px;display:none;background:oklch(0.205 0.012 65/.94);color:#fff;border-radius:22px;padding:16px 26px 20px;max-width:760px;box-shadow:0 14px 44px rgb(0 0 0/.28)}
  #cap .lab{font:600 12.5px var(--font-sans),Figtree,sans-serif;letter-spacing:.16em;color:oklch(0.78 0.14 45);margin-bottom:6px}
  #cap .pain{position:relative;display:inline-block;font:400 21px var(--font-sans),Figtree,sans-serif;color:#d2ccc5;margin-bottom:4px}
  #cap .pain u{position:absolute;left:0;top:52%;height:2.5px;background:oklch(0.7 0.19 30);width:0;display:block}
  #cap .row{display:flex;align-items:center;gap:16px}
  #cap .head{font:500 33px/1.12 var(--font-display),Outfit,sans-serif;letter-spacing:-.022em}
  #cap .badge{background:var(--coral);color:#fff;border-radius:16px;padding:6px 16px;font:600 40px/1.1 var(--font-display),Outfit,sans-serif;letter-spacing:-.02em}
  #sw{position:absolute;left:682px;top:268px;transform:translateX(-50%);text-align:center;display:none}
  #sw .lab{font:600 14px var(--font-sans),Figtree,sans-serif;letter-spacing:.2em;color:var(--coral-ink)}
  #sw .dig{font:500 112px/1.05 var(--font-display),Outfit,sans-serif;letter-spacing:-.03em;font-variant-numeric:tabular-nums;margin:6px 0}
  #sw .sub{font-size:19px;color:var(--soft)}
  #sw .bar{height:5px;border-radius:5px;background:var(--hair);margin:14px auto 0;width:340px;overflow:hidden}
  #sw .bar b{display:block;height:100%;background:var(--coral);width:0}
  #flash{position:absolute;inset:0;background:#fff;opacity:0}
  .mark{width:96px;height:96px;border-radius:26px;background:var(--ink);color:#fff;display:grid;place-items:center;font:600 38px var(--font-display),Outfit,sans-serif;letter-spacing:-.02em}
  .chip{font-size:20px;padding:9px 20px;border-radius:999px;border:1.5px solid oklch(0.88 0.006 80);background:#fff;color:var(--soft)}
  `;
  document.head.appendChild(st);
  const ov = document.createElement("div"); ov.id = "ov"; document.body.appendChild(ov);
  const el = (tag, cls, html, parent = ov, id) => { const e = document.createElement(tag); if (cls) e.className = cls; if (id) e.id = id; if (html != null) e.innerHTML = html; parent.appendChild(e); return e; };

  // ---------- chaos opener ----------
  const chaos = el("div", "scene", "", ov, "chaos");
  const h1 = el("div", "abs disp", "Planning a trip with friends…", chaos); Object.assign(h1.style, { left: "80px", top: "52px", fontSize: "54px" });
  const h2 = el("div", "abs disp coral", "…is chaos.", chaos); Object.assign(h2.style, { left: "80px", top: "118px", fontSize: "54px" });
  const card = el("div", "abs", "", chaos, "chatcard");
  const head = el("div", "", `<span>Lisbon trip 🇵🇹 · 4 people</span><span id="unread">3 unread</span>`, card); head.id = "chathead";
  const msgsEl = el("div", "", "", card, "msgs");
  const WHO = { Maya: "oklch(0.55 0.16 35)", Noah: "oklch(0.44 0.085 225)", Sam: "oklch(0.44 0.1 158)" };
  const MSGS = [[1.0, "Maya", "Lisbon in November?? 😍"], [1.5, "Noah", "I'm in"], [2.0, "Sam", "flights are insane rn"], [2.5, "Maya", "can someone make a spreadsheet"], [3.0, "Noah", "what's the budget??"], [3.5, "Sam", "which dates tho"], [4.0, "Maya", "where do we even stay"], [4.5, "Noah", "did anyone check the weather"], [5.0, "Sam", "ok I'll look later"], [5.5, "Maya", "…?"], [5.75, "Noah", "any updates?"], [6.0, "Sam", "👀"], [6.25, "Maya", "so are we going or"], [6.5, "Noah", "??"], [6.75, "Sam", "wait what's the plan"], [7.0, "Maya", "!!!"], [7.25, "Noah", "which tab was that"], [7.5, "Sam", "🙃"]];
  const msgEls = MSGS.map(([t, who, text]) => { const m = el("div", "msg", `<div class="who" style="color:${WHO[who]}">${who}</div><div class="b">${text}</div>`, msgsEl); m.style.display = "none"; return { m, t }; });
  const tp = el("div", "abs", "", chaos, "tabspanel");
  const th = el("div", "", `<span id="tabcount" class="disp">4</span><span class="disp" style="font-size:34px;color:var(--soft)">tabs open</span>`, tp, "tabshead");
  const tw = el("div", "", "", tp, "tabswrap");
  const TT = ["Cheap flights to Lisbon", "Airbnb · Alfama", "Reddit: is Lisbon worth it?", "Google Maps", "Booking.com", "TripAdvisor: top 10", "Weather in November", "Trip budget (Sheet) v3", "Lisbon food guide", "Tram 28 tips", "Splitwise", "Skyscanner", "Hostelworld", "Time Out Lisbon", "Pastéis de Belém", "Notes: Lisbon??", "Currency converter", "Metro map PDF", "Viator tours", "Yelp: best dinner", "Flights (2)", "Airbnb (2)", "Maps (3)", "Itinerary v2 FINAL", "Itinerary v2 FINAL (1)", "Tuk tuk prices", "Is Lisbon safe?", "Day trips: Sintra", "Travel insurance", "Lisbon card worth it?", "Booking.com (2)", "Hotel reviews", "Direct flights?", "Weather (2)", "Sheets: who owes what", "Kayak"];
  const COL = ["#cc4c28", "#2684ae", "#2f8e60", "#b47819", "#8656b7", "#847f78"];
  const tabEls = TT.map((t, i) => { const e = el("div", "tab", `<i style="background:${COL[i % 6]}"></i>${t}`, tw); e.style.display = "none"; return { e, t: 1.0 + i * 0.19 }; });

  // ---------- question ----------
  const ask = el("div", "scene", "", ov, "ask"); ask.style.cssText += ";display:none;align-items:center;justify-content:center;flex-direction:column";
  const q1 = el("div", "disp", "What if you could", ask); q1.style.fontSize = "84px";
  const q2 = el("div", "disp coral", "just say it?", ask); q2.style.fontSize = "84px";

  // ---------- footage overlays ----------
  const cap = el("div", "", `<div class="lab"></div><div class="pain"><span></span><u></u></div><div class="row"><span class="badge"></span><span class="head"></span></div>`, ov, "cap");
  const sw = el("div", "", `<div class="lab">ROAM IS PLANNING</div><div class="dig">00:00.0</div><div class="sub">reading real places, hours and distances</div><div class="bar"><b></b></div>`, ov, "sw");

  // ---------- payoff + end ----------
  const pay = el("div", "scene", "", ov, "pay"); pay.style.cssText += ";display:none;align-items:center;justify-content:center;flex-direction:column";
  const p1 = el("div", "disp", "From “we should go somewhere”", pay); p1.style.fontSize = "72px";
  const p2 = el("div", "disp coral", "to a plan everyone's in on.", pay); p2.style.fontSize = "72px";
  const lg = el("div", "abs", `<div class="mark">WN</div>`, pay); Object.assign(lg.style, { left: "50%", top: "50%", marginLeft: "-48px", marginTop: "-48px" });
  const end = el("div", "scene", "", ov, "end"); end.style.cssText += ";display:none;align-items:center;justify-content:center;flex-direction:column";
  const e1 = el("div", "", `<div style="display:flex;align-items:center;gap:20px"><div class="mark">WN</div><span class="disp" style="font-size:64px">Where Next</span></div>`, end);
  const e2 = el("div", "disp", `Plan the trip <span class="coral">together.</span>`, end); Object.assign(e2.style, { fontSize: "84px", marginTop: "34px" });
  const e3 = el("div", "", "Chat with Roam. Turn the conversation into one plan, built from real places.", end); Object.assign(e3.style, { fontSize: "26px", color: "var(--soft)", marginTop: "20px" });
  const e4 = el("div", "", ["Next.js 15", "React 19", "Supabase", "Claude", "Mapbox", "Vercel"].map(x => `<span class="chip">${x}</span>`).join(""), end); Object.assign(e4.style, { display: "flex", gap: "12px", marginTop: "40px" });
  const e5 = el("div", "", "Designed and built by Kanwaljot Singh", end); Object.assign(e5.style, { fontSize: "22px", color: "oklch(0.5 0.012 72)", marginTop: "34px", letterSpacing: ".02em" });
  const flash = el("div", "", "", ov, "flash");

  // ---------- render(t) ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const eo = x => 1 - Math.pow(1 - clamp(x), 3);
  const spring = x => { x = clamp(x); return 1 - Math.exp(-7 * x) * Math.cos(11 * x); };
  const f = n => n.toFixed(3);
  window.__render = t => {
    const K = [];
    const S = (e, o) => { for (const k in o) { e.style[k] = o[k]; K.push(e.id + e.className + k + o[k]); } };
    const reveal = (e, t0, dur = 0.35, dy = 18) => { const p = eo((t - t0) / dur); S(e, { opacity: f(p), transform: `translateY(${f(dy * (1 - p))}px)` }); };
    // scenes
    S(chaos, { display: t < 8.0 ? "block" : "none" });
    S(ask, { display: t >= 8.0 && t < 10 ? "flex" : "none" });
    S(pay, { display: t >= 48 && t < 54 ? "flex" : "none" });
    S(end, { display: t >= 54 ? "flex" : "none" });
    if (t < 8) {
      const shake = t > 6.5 ? (t - 6.5) / 1.5 : 0, sx = (a, b) => f(Math.sin(t * a) * b * shake);
      reveal(h1, 0.5, 0.45); reveal(h2, 4.0, 0.3, 24);
      S(h2, { marginLeft: sx(70, 5) + "px", marginTop: sx(83, 4) + "px" });
      S(card, { marginLeft: sx(61, 5) + "px", marginTop: sx(77, 4) + "px" }); S(tp, { marginLeft: sx(67, 5) + "px", marginTop: sx(91, 3) + "px" });
      let n = 0; for (const { m, t: t0 } of msgEls) { const on = t >= t0; if (on) n++; S(m, { display: on ? "block" : "none", opacity: on ? f(eo((t - t0) / 0.18)) : "0", transform: `translateY(${on ? f(14 * (1 - eo((t - t0) / 0.18))) : 14}px)` }); }
      document.getElementById("unread").textContent = `${3 + n * 4} unread`; K.push("unread" + n);
      let tabsOn = 0; for (const { e, t: t0 } of tabEls) { const on = t >= t0; if (on) tabsOn++; S(e, { display: on ? "flex" : "none", opacity: on ? f(eo((t - t0) / 0.16)) : "0" }); }
      document.getElementById("tabcount").textContent = String(4 + tabsOn); K.push("tabs" + tabsOn);
      S(chaos, { opacity: t > 7.8 ? String(Math.floor(t * 30) % 2 ? 0.55 : 1) : "1" });
    }
    if (t >= 8 && t < 10) { reveal(q1, 8.5, 0.4, 22); reveal(q2, 9.0, 0.4, 22); }
    if (t >= 48 && t < 54) {
      const fade = 1 - eo((t - 52.0) / 0.35);
      reveal(p1, 48.0, 0.45, 26); reveal(p2, 50.0, 0.45, 26);
      if (t >= 52.0) { S(p1, { opacity: f(fade) }); S(p2, { opacity: f(fade) }); }
      const ls = t >= 53.0 ? spring((t - 53.0) / 0.5) : 0; S(lg, { opacity: t >= 53 ? "1" : "0", transform: `scale(${f(ls)})` });
    }
    if (t >= 54) {
      reveal(e1, 54.0, 0.45); reveal(e2, 54.5, 0.45, 22); reveal(e3, 55.5, 0.4, 14); reveal(e4, 56.0, 0.4, 14); reveal(e5, 56.5, 0.4, 10);
      S(end, { opacity: f(1 - clamp((t - 59.4) / 0.6)) });
    }
    // captions
    const ev = CAPTIONS.find(c => t >= c.t0 && t < c.t1);
    if (ev) {
      const k = Math.min(eo((t - ev.t0) / 0.28), eo((ev.t1 - t) / 0.22));
      cap.querySelector(".lab").textContent = ev.label;
      cap.querySelector(".pain").style.display = ev.pain ? "inline-block" : "none";
      cap.querySelector(".pain span").textContent = ev.pain || "";
      const badge = cap.querySelector(".badge"); badge.style.display = ev.badge ? "inline-block" : "none"; badge.textContent = ev.badge || "";
      cap.querySelector(".head").textContent = ev.head;
      const headOp = ev.pain ? eo((t - (ev.t0 + 1.0)) / 0.28) : 1;
      S(cap, { display: "block", opacity: f(k), transform: `translateY(${f(18 * (1 - k))}px)` });
      S(cap.querySelector(".head"), { opacity: f(headOp), transform: `translateX(${f(16 * (1 - headOp))}px)` });
      cap.querySelector(".pain u").style.width = f(100 * clamp((t - (ev.t0 + 0.5)) / 0.3)) + "%";
      if (ev.badge) badge.style.transform = `scale(${f(0.6 + 0.4 * spring((t - ev.t0) / 0.5))})`;
      K.push("cap" + ev.t0 + cap.querySelector(".pain u").style.width);
    } else S(cap, { display: "none" });
    // stopwatch
    if (t >= STOPWATCH.t0 && t < STOPWATCH.t1) {
      const p = clamp((t - STOPWATCH.t0) / (STOPWATCH.t1 - STOPWATCH.t0)), v = p * STOPWATCH.elapsed;
      const mm = String(Math.floor(v / 60)).padStart(2, "0"), ss = String(Math.floor(v % 60)).padStart(2, "0"), d = Math.floor((v * 10) % 10);
      sw.querySelector(".dig").textContent = `${mm}:${ss}.${d}`; sw.querySelector(".bar b").style.width = f(p * 100) + "%";
      S(sw, { display: "block", opacity: f(eo((t - STOPWATCH.t0) / 0.2)) }); K.push("sw" + mm + ss + d);
    } else S(sw, { display: "none" });
    // flashes
    let fa = 0; for (const fl of FLASHES) if (t >= fl.t && t < fl.t + fl.d) fa = Math.max(fa, 0.85 * Math.pow(1 - (t - fl.t) / fl.d, 2));
    S(flash, { opacity: f(fa) });
    return K.join("|");
  };
}, { CAPTIONS, STOPWATCH, FLASHES });

if (process.env.FRAMES) {
  mkdirSync("ovtest", { recursive: true });
  for (const t of process.env.FRAMES.split(",").map(Number)) { await page.evaluate(t => window.__render(t), t); await page.screenshot({ path: `ovtest/t-${t}.png`, omitBackground: true }); }
  await browser.close(); process.exit(0);
}
rmSync("ov", { recursive: true, force: true }); mkdirSync("ov");
const N = TOTAL * FPS; let prev = null, last = null, shots = 0;
for (let i = 0; i < N; i++) {
  const t = i / FPS;
  if (only && !only.includes(Math.floor(t))) { const f = `ov/${String(i).padStart(5, "0")}.png`; if (last) symlinkSync(last.replace("ov/", ""), f); continue; }
  const key = await page.evaluate(t => window.__render(t), t);
  const file = `ov/${String(i).padStart(5, "0")}.png`;
  if (key !== prev || !last) { await page.screenshot({ path: file, omitBackground: true, type: "png" }); last = file; prev = key; shots++; }
  else symlinkSync(last.replace("ov/", ""), file);
  if (i % 300 === 0) console.log("frame", i, "shots", shots);
}
console.log("done", N, "frames,", shots, "unique screenshots");
await browser.close();
