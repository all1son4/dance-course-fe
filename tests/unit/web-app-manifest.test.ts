import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import manifest from "../../src/app/manifest";
import { SITE_APP_ICONS, SITE_THEME_COLORS } from "../../src/lib/site-chrome";

const PUBLIC_DIR = path.join(import.meta.dirname, "../../public");

/** Width and height from a PNG's IHDR chunk. */
const readPngSize = (publicPath: string) => {
  const file = readFileSync(path.join(PUBLIC_DIR, publicPath));
  assert.equal(
    file.subarray(1, 4).toString("latin1"),
    "PNG",
    `${publicPath} is not a PNG`,
  );

  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
};

describe("web app manifest", () => {
  const result = manifest();

  it("stays a bookmark that opens in the browser, not a standalone app", () => {
    assert.ok(result.display === "browser" || result.display === "minimal-ui");
    assert.equal(result.start_url, "/");
    assert.equal(result.name, "Anna Strok");
  });

  it("lists icons that exist at the sizes they claim", () => {
    for (const icon of result.icons ?? []) {
      if (icon.type !== "image/png") continue;
      const [width, height] = (icon.sizes ?? "").split("x").map(Number);
      assert.deepEqual(readPngSize(icon.src), { width, height }, icon.src);
    }
  });

  it("keeps the apple touch icon at 180px", () => {
    assert.deepEqual(readPngSize(SITE_APP_ICONS.apple), { width: 180, height: 180 });
  });

  it("uses six-digit hex colours, which every browser bar accepts", () => {
    for (const color of [
      result.theme_color,
      result.background_color,
      SITE_THEME_COLORS.light,
      SITE_THEME_COLORS.dark,
    ]) {
      assert.match(color ?? "", /^#[0-9a-f]{6}$/u);
    }
  });
});
