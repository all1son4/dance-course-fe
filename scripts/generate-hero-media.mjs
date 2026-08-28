// Regenerates the hero photo width variants listed in src/constants/hero-media.ts.
// Usage: node scripts/generate-hero-media.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors HERO_MEDIA (kept in plain JS so the script needs no TypeScript runtime).
const ASSETS = [
  ["/svg/MainPageBackgroundPhoto.webp", [480, 720, 960, 1200]],
  ["/svg/OnlinePageBackgroundPhoto.webp", [480, 720, 960]],
  ["/svg/OnlineChoreoPageBackgroundPhoto.webp", [480, 720, 960, 1200]],
  ["/svg/FirstTouchPageBackgroundPhoto.webp", [480, 720, 960]],
  ["/svg/OfflinePageBackgroundPhoto.webp", [480, 720, 960]],
  ["/svg/OnlineTelegramBig.webp", [453]],
  ["/svg/TelegramChoreo.webp", [401]],
  ["/svg/FirstTouchTelegram.webp", [356]],
  ["/svg/WarsawMap.webp", [379]],
];

for (const [src, widths] of ASSETS) {
  const input = path.join(root, "public", src);
  for (const width of widths) {
    const output = input.replace(/\.webp$/u, `-w${width}.webp`);
    const info = await sharp(input)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 85, effort: 6, smartSubsample: true })
      .toFile(output);
    console.log(
      `${path.basename(output)} ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`,
    );
  }
}
