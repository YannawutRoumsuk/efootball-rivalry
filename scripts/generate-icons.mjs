// Renders the PWA / Apple touch icons from public/icons/icon.svg.
// Usage: node scripts/generate-icons.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url));
const svg = await readFile(`${dir}icon.svg`);

const outputs = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  // Maskable icons need a safe zone: shrink the artwork inside a padded canvas.
  ["icon-maskable-512.png", 512, 0.12],
];

for (const [name, size, pad] of outputs) {
  const inner = Math.round(size * (1 - pad * 2));
  const art = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0b1120" } })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(`${dir}${name}`);
  console.log("wrote", name);
}
