import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldShowStickyCta,
  STICKY_CTA_ANCHOR_ATTRIBUTE,
  STICKY_CTA_ANCHOR_SELECTOR,
  STICKY_CTA_BLOCKER_ATTRIBUTE,
  STICKY_CTA_BLOCKER_SELECTOR,
  stickyCtaAnchorProps,
  stickyCtaBlockerProps,
  type StickyCtaVisibilityInput,
} from "@/lib/sticky-cta";

const visibleCase: StickyCtaVisibilityInput = {
  anchorCount: 2,
  anchorsInView: 0,
  hasMeasured: true,
  hasPassedAnchor: true,
  isCookieBannerVisible: false,
  isDialogOpen: false,
  isFooterCoveringViewport: false,
};

test("shows once every anchor has left the viewport", () => {
  assert.equal(shouldShowStickyCta(visibleCase), true);
});

test("stays hidden while any on-page CTA is still visible", () => {
  assert.equal(shouldShowStickyCta({ ...visibleCase, anchorsInView: 1 }), false);
});

test("waits until the reader has scrolled past a CTA", () => {
  assert.equal(shouldShowStickyCta({ ...visibleCase, hasPassedAnchor: false }), false);
});

test("never shows on a page without anchors", () => {
  assert.equal(
    shouldShowStickyCta({ ...visibleCase, anchorCount: 0, anchorsInView: 0 }),
    false,
  );
});

test("waits for the first measurement to avoid a first-paint flash", () => {
  assert.equal(shouldShowStickyCta({ ...visibleCase, hasMeasured: false }), false);
});

test("yields to a screen-filling footer, the cookie banner and open dialogs", () => {
  assert.equal(
    shouldShowStickyCta({ ...visibleCase, isFooterCoveringViewport: true }),
    false,
  );
  assert.equal(
    shouldShowStickyCta({ ...visibleCase, isCookieBannerVisible: true }),
    false,
  );
  assert.equal(shouldShowStickyCta({ ...visibleCase, isDialogOpen: true }), false);
});

test("anchor and blocker helpers agree on their attribute names", () => {
  assert.equal(STICKY_CTA_ANCHOR_SELECTOR, `[${STICKY_CTA_ANCHOR_ATTRIBUTE}]`);
  assert.deepEqual(Object.keys(stickyCtaAnchorProps), [STICKY_CTA_ANCHOR_ATTRIBUTE]);
  assert.equal(STICKY_CTA_BLOCKER_SELECTOR, `[${STICKY_CTA_BLOCKER_ATTRIBUTE}]`);
  assert.deepEqual(Object.keys(stickyCtaBlockerProps), [STICKY_CTA_BLOCKER_ATTRIBUTE]);
  assert.notEqual(STICKY_CTA_ANCHOR_ATTRIBUTE, STICKY_CTA_BLOCKER_ATTRIBUTE);
});
