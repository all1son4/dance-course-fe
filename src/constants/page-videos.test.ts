import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { PAGE_VIDEOS } from "./page-videos";

const publicDir = path.join(process.cwd(), "public");

describe("PAGE_VIDEOS", () => {
  for (const [src, video] of Object.entries(PAGE_VIDEOS)) {
    it(`${src}: the file and its poster exist, dates and durations are ISO 8601`, () => {
      assert.ok(existsSync(path.join(publicDir, src)), src);
      assert.ok(existsSync(path.join(publicDir, video.poster)), video.poster);
      // Google asks for a time zone with the upload date.
      assert.match(
        video.uploadDate,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u,
      );
      assert.match(video.duration, /^PT(\d+M)?\d+S$/u);
    });
  }

  it("knows the First Touch introduction video of every language", () => {
    for (const locale of ["en", "ru", "pl"]) {
      const messages = JSON.parse(
        readFileSync(path.join(process.cwd(), "src/messages", `${locale}.json`), "utf8"),
      );
      const src = messages.FirstTouchPage.hero.introductionVideoSrc;

      assert.ok(PAGE_VIDEOS[src], `${locale}: ${src}`);
      assert.ok(messages.Metadata.pages.firstTouch.video.name, locale);
      assert.ok(messages.Metadata.pages.onlineGroup.video.description, locale);
    }
  });
});
