import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import sitemap from "@/app/sitemap";
import { normalizedSiteUrl } from "@/lib/seo";

const publicFile = (url: string) =>
  path.join(process.cwd(), "public", url.slice(normalizedSiteUrl.length));

describe("sitemap", () => {
  const entries = sitemap();

  it("lists the home page in the canonical form, without a trailing slash", () => {
    assert.equal(entries[0].url, normalizedSiteUrl);
    assert.ok(entries.slice(1).every((entry) => !entry.url.endsWith("/")));
  });

  it("gives every page a fixed calendar lastmod, never the request time", () => {
    for (const entry of entries) {
      assert.match(String(entry.lastModified), /^\d{4}-\d{2}-\d{2}$/u, entry.url);
    }
  });

  it("points images, posters and videos at files that exist", () => {
    for (const entry of entries) {
      for (const image of entry.images ?? []) {
        assert.ok(existsSync(publicFile(image)), image);
      }
      for (const video of entry.videos ?? []) {
        assert.ok(video.title && video.description, entry.url);
        assert.ok(existsSync(publicFile(video.thumbnail_loc)), video.thumbnail_loc);
        assert.ok(video.content_loc && existsSync(publicFile(video.content_loc)));
      }
    }
  });

  it("describes the videos the product pages play", () => {
    const videoPages = entries
      .filter((entry) => entry.videos?.length)
      .map((entry) => entry.url.slice(normalizedSiteUrl.length));

    assert.deepEqual(videoPages, ["/online/group", "/online/first-touch"]);
  });
});
