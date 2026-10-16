/**
 * One-time: normalise the trips-home carousel photographs to the sizes the hero actually needs.
 *
 * The hero is a full-bleed band, 480px tall on a phone and 420px above that, so the widest it ever
 * draws an image is about 1600px (a 2560px screen at DPR 1 crops, it doesn't upscale) — yet three
 * photographs are mounted at once (the one showing, the one fading out, the one loading), so the set
 * cost about 1.1MB of 1800px originals for a band most people see at under 900px.
 *
 * Writes, for each photograph in /public/hero:
 *   <name>.webp       the master, resized to at most 1600px wide (in place)
 *   <name>-1300.webp  for a laptop or a narrow window
 *   <name>-900.webp   for a phone and a half-screen window
 * HeroCarousel offers all three in one `srcset` and lets the browser take the smallest that fits.
 * Run once, commit the output; there is no build step wired to this.
 *
 *   bun run scripts/resize-hero-scenes.ts
 */
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = `${fileURLToPath(new URL("../", import.meta.url))}public/hero`;
/** The master's cap, and the smaller widths offered beside it. */
const MASTER_WIDTH = 1600;
const VARIANTS = [1300, 900];
// The master keeps its photographic quality (it is what a retina phone and a wide desktop get);
// the smaller ones are downscales, where the resampling already hides what a lower setting costs.
const MASTER_QUALITY = 90;
const VARIANT_QUALITY = 82;

const kb = (path: string) => `${(statSync(path).size / 1024).toFixed(0)}K`;
const masters = readdirSync(dir)
  .filter((file) => file.endsWith(".webp"))
  .filter((file) => !VARIANTS.some((width) => file.endsWith(`-${width}.webp`)));

for (const file of masters) {
  const path = `${dir}/${file}`;
  const base = file.replace(/\.webp$/, "");
  const before = kb(path);
  const { width } = await sharp(path).metadata();

  if ((width ?? 0) > MASTER_WIDTH) {
    // sharp cannot write over the file it is reading.
    const resized = await sharp(path).resize({ width: MASTER_WIDTH }).webp({ quality: MASTER_QUALITY }).toBuffer();
    await sharp(resized).toFile(path);
  }
  for (const target of VARIANTS) {
    await sharp(path).resize({ width: target }).webp({ quality: VARIANT_QUALITY }).toFile(`${dir}/${base}-${target}.webp`);
  }

  console.log(`${base}: ${width}px ${before} → ${MASTER_WIDTH}px ${kb(path)}, ${VARIANTS.map((w) => `${w}px ${kb(`${dir}/${base}-${w}.webp`)}`).join(", ")}`);
}
