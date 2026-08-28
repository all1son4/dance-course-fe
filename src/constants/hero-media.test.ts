import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { buildHeroMediaSrcSet, HERO_MEDIA, heroMediaVariantPath } from "./hero-media";

const publicDir = path.join(process.cwd(), "public");

describe("HERO_MEDIA", () => {
  for (const [name, asset] of Object.entries(HERO_MEDIA)) {
    it(`${name}: every variant file exists and widths are ascending below native`, () => {
      assert.ok(existsSync(path.join(publicDir, asset.src)), asset.src);

      let previous = 0;
      for (const width of asset.widths) {
        assert.ok(width > previous && width < asset.nativeWidth, `${name} ${width}`);
        assert.ok(
          existsSync(path.join(publicDir, heroMediaVariantPath(asset.src, width))),
          `${name} missing variant ${width}`,
        );
        previous = width;
      }
    });
  }

  it("builds a srcset ending with the original at its native width", () => {
    assert.equal(
      buildHeroMediaSrcSet(HERO_MEDIA.online),
      "/svg/OnlinePageBackgroundPhoto-w480.webp 480w, /svg/OnlinePageBackgroundPhoto-w720.webp 720w, /svg/OnlinePageBackgroundPhoto-w960.webp 960w, /svg/OnlinePageBackgroundPhoto.webp 1196w",
    );
  });
});
