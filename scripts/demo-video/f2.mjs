// Footage 2 (no captions): map -> plan -> stays -> discover.
import { readFileSync } from "node:fs";
import { open } from "./stage.mjs";
const { tripId } = JSON.parse(readFileSync("trip.json", "utf8"));
const S = await open({ name: "f2" }); const p = S.page;
const nav = label => p.locator("nav a, aside a, a").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
const scroll = async (dy, ms) => { const n = Math.round(ms / 16); for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy / n); await p.waitForTimeout(16); } };
await S.goto(`/trips/${tripId}/chat`); await p.getByText("Open Day 1").first().waitFor({ timeout: 60000 }); await p.waitForTimeout(1500);
{ const mb = p.locator("button:visible").filter({ hasText: /^\s*Map\s*$/ }).first(); const b = await mb.boundingBox(); if (b && b.y < 110) { await p.mouse.move(700, 420); await p.mouse.wheel(0, -(120 - b.y)); await p.waitForTimeout(600); } }
await S.start(); await p.waitForTimeout(700);
S.mark("map"); await S.click(p.locator("button:visible").filter({ hasText: /^\s*Map\s*$/ }).first());
await p.locator("canvas.mapboxgl-canvas").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(2200); S.mark("mapReady");
await p.mouse.move(1000, 520, { steps: 40 }); await p.waitForTimeout(3000);
S.mark("plan"); await S.click(nav("Plan")); await p.getByText("The plan, day by day").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(700); S.mark("planReady");
await scroll(420, 2400); await p.waitForTimeout(1500);
S.mark("stay"); await S.click(nav("Stay"));
await p.getByText("Where you’ll come back to each night").or(p.getByText("Where you'll come back to each night")).first().waitFor({ timeout: 30000 });
await p.waitForFunction(() => document.querySelectorAll("img").length > 6, null, { timeout: 40000 }).catch(() => {}); await p.waitForTimeout(1500); S.mark("stayReady");
await scroll(360, 2200); await p.waitForTimeout(1200);
S.mark("discover"); await S.click(nav("Discover")); await p.getByText("Top sights").first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1800); S.mark("discoverReady");
await scroll(380, 2400); await p.waitForTimeout(1500);
console.log(await S.finish(), S.marks);
