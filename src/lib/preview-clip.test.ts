import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPreviewClipInView,
  PREVIEW_CLIP_IN_VIEW_THRESHOLDS,
  resolvePreviewClipMode,
} from "./preview-clip";

describe("resolvePreviewClipMode", () => {
  it("plays on hover with a mouse and in view on touch", () => {
    assert.equal(
      resolvePreviewClipMode({
        canHover: true,
        prefersReducedMotion: false,
        saveData: false,
      }),
      "hover",
    );
    assert.equal(
      resolvePreviewClipMode({
        canHover: false,
        prefersReducedMotion: false,
        saveData: false,
      }),
      "in-view",
    );
  });

  it("stays off under reduced motion or data saver, whatever the pointer", () => {
    for (const canHover of [true, false]) {
      assert.equal(
        resolvePreviewClipMode({ canHover, prefersReducedMotion: true, saveData: false }),
        "off",
      );
      assert.equal(
        resolvePreviewClipMode({ canHover, prefersReducedMotion: false, saveData: true }),
        "off",
      );
    }
  });
});

describe("isPreviewClipInView", () => {
  it("needs 60% of the card on screen", () => {
    assert.equal(
      isPreviewClipInView({ ratio: 0.59, visibleHeight: 300, viewportHeight: 800 }),
      false,
    );
    assert.equal(
      isPreviewClipInView({ ratio: 0.6, visibleHeight: 320, viewportHeight: 800 }),
      true,
    );
  });

  it("counts a card taller than the screen once it fills 60% of it", () => {
    assert.equal(
      isPreviewClipInView({ ratio: 0.45, visibleHeight: 500, viewportHeight: 800 }),
      true,
    );
    assert.equal(
      isPreviewClipInView({ ratio: 0.3, visibleHeight: 400, viewportHeight: 800 }),
      false,
    );
  });

  it("is never in view while off screen", () => {
    assert.equal(
      isPreviewClipInView({ ratio: 0, visibleHeight: 0, viewportHeight: 800 }),
      false,
    );
    assert.equal(
      isPreviewClipInView({ ratio: 0, visibleHeight: 0, viewportHeight: 0 }),
      false,
    );
  });

  it("observes the 60% threshold itself", () => {
    assert.ok(PREVIEW_CLIP_IN_VIEW_THRESHOLDS.includes(0.6));
  });
});
