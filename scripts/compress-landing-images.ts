/**
 * One-time: recompress the landing page's hero photos to WebP. The PNGs are 2.5-3MB
 * each — pure page weight on the one page that most needs to load fast. Run once and
 * commit the .webp output alongside the untouched originals; there is no build step
 * wired to this.
 *
 *   bun run scripts/compress-landing-images.ts
 */
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = `${root}public/design`;

const jobs = ["land-mountains-right-v2", "land-coast-v3"];

for (const name of jobs) {
  await sharp(`${dir}/${name}.png`).webp({ quality: 80 }).toFile(`${dir}/${name}.webp`);
  console.log(`wrote public/design/${name}.webp`);
}
