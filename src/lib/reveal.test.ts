import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignWaveDelays,
  parseGroupStagger,
  REVEAL_STAGGER_MS,
  revealGroupProps,
  shouldStartRevealed,
} from "./reveal";

describe("shouldStartRevealed", () => {
  it("keeps elements that are on screen at hydration visible", () => {
    assert.equal(shouldStartRevealed({ top: 200, bottom: 400 }, 0, 900), true);
    assert.equal(shouldStartRevealed({ top: -100, bottom: 50 }, 3000, 900), true);
  });

  it("keeps elements within the first screen of the document visible even when the window is scrolled elsewhere", () => {
    // Client navigation: the previous page's scroll offset is still in effect.
    assert.equal(shouldStartRevealed({ top: -2500, bottom: -2300 }, 3000, 900), true);
  });

  it("lets elements below the first screen wait for the observer", () => {
    assert.equal(shouldStartRevealed({ top: 1200, bottom: 1500 }, 0, 900), false);
    assert.equal(shouldStartRevealed({ top: 950, bottom: 1100 }, 200, 900), false);
  });

  it("treats an element touching the bottom edge as visible", () => {
    assert.equal(shouldStartRevealed({ top: 899, bottom: 1200 }, 5000, 900), true);
    assert.equal(shouldStartRevealed({ top: 900, bottom: 1200 }, 5000, 900), false);
  });
});

describe("assignWaveDelays", () => {
  const groupA = { id: "a" };
  const groupB = { id: "b" };
  const item = (top: number, left: number, group: object | null, staggerMs = 60) => ({
    top,
    left,
    group,
    staggerMs,
  });

  it("staggers group members in reading order regardless of observer order", () => {
    const hits = [item(400, 0, groupA), item(100, 300, groupA), item(100, 0, groupA)];
    const waves = assignWaveDelays(hits);

    assert.deepEqual(
      waves.map(({ item: hit, delayMs }) => [hit.top, hit.left, delayMs]),
      [
        [100, 0, 0],
        [100, 300, 60],
        [400, 0, 120],
      ],
    );
  });

  it("counts each group separately and never delays solo elements", () => {
    const hits = [
      item(0, 0, groupA),
      item(10, 0, null),
      item(20, 0, groupB),
      item(30, 0, groupA, 100),
    ];
    const waves = assignWaveDelays(hits);

    assert.deepEqual(
      waves.map(({ item: hit, delayMs }) => [hit.group, delayMs]),
      [
        [groupA, 0],
        [null, 0],
        [groupB, 0],
        [groupA, 100],
      ],
    );
  });

  it("returns an empty wave for no hits", () => {
    assert.deepEqual(assignWaveDelays([]), []);
  });
});

describe("group marker", () => {
  it("round-trips the stagger through the attribute", () => {
    assert.equal(
      parseGroupStagger(revealGroupProps(220)["data-reveal-group"] ?? null),
      220,
    );
    assert.equal(
      parseGroupStagger(revealGroupProps()["data-reveal-group"] ?? null),
      REVEAL_STAGGER_MS,
    );
  });

  it("falls back to the default for missing or malformed values", () => {
    assert.equal(parseGroupStagger(null), REVEAL_STAGGER_MS);
    assert.equal(parseGroupStagger(""), REVEAL_STAGGER_MS);
    assert.equal(parseGroupStagger("fast"), REVEAL_STAGGER_MS);
    assert.equal(parseGroupStagger("-5"), REVEAL_STAGGER_MS);
  });
});
