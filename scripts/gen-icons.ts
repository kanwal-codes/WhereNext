/**
 * Regenerate the PWA PNG icons from app/icon.svg. Run once and commit the output;
 * there is no build step for this.
 *
 *   bun run scripts/gen-icons.ts
 */
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const svg = readFileSync(`${root}app/icon.svg`);
const outDir = `${root}public/icons`;
mkdirSync(outDir, { recursive: true });

const jobs: Array<[string, number, boolean]> = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-512-maskable.png", 512, true],
];

for (const [name, size, maskable] of jobs) {
  // Maskable icons need ~20% safe padding so the platform's mask never clips the glyph.
  const pad = maskable ? Math.round(size * 0.1) : 0;
  await sharp(svg, { density: 384 })
    .resize(size - pad * 2, size - pad * 2, { fit: "contain", background: "#1b1c20" })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#1b1c20" })
    .png()
    .toFile(`${outDir}/${name}`);
  console.log(`wrote public/icons/${name}`);
}
