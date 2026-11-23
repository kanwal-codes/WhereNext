// Footage 3 (no captions): group thread, then @Roam answers live.
import { readFileSync } from "node:fs";
import { open } from "./stage.mjs";
const { tripId } = JSON.parse(readFileSync("trip.json", "utf8"));
const S = await open({ name: "f3" }); const p = S.page;
await S.goto(`/trips/${tripId}/group`); await p.getByText("Lisbon in November").first().waitFor({ timeout: 60000 }); await p.waitForTimeout(2500);
if ((await p.evaluate(() => document.body.innerText)).includes("Someone")) { await p.reload({ waitUntil: "domcontentloaded" }); await p.getByText("Lisbon in November").first().waitFor({ timeout: 60000 }); await p.waitForTimeout(2500); }
await S.start(); await p.waitForTimeout(800); S.mark("thread");
await p.mouse.move(900, 380, { steps: 35 }); await p.waitForTimeout(2600);
const box = p.getByLabel("Message the group", { exact: true });
await p.waitForFunction(() => !document.querySelector('textarea[aria-label="Message the group"]')?.disabled, null, { timeout: 30000 });
await S.click(box); S.mark("typeStart");
await S.type("@Roam a Friday dinner near the viewpoint, nothing touristy", 50); await p.waitForTimeout(500);
const len0 = await p.evaluate(() => document.body.innerText.length);
S.mark("send"); await p.keyboard.press("Enter");
let stable = 0, last = 0;
for (let i = 0; i < 120; i++) { await p.waitForTimeout(1000); const n = await p.evaluate(() => document.body.innerText.length); stable = n === last ? stable + 1 : 0; last = n; if (n > len0 + 260 && stable >= 4) break; }
S.mark("reply"); await p.waitForTimeout(3500);
console.log(await S.finish(), S.marks);
