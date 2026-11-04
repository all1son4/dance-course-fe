import assert from "node:assert/strict";
import test from "node:test";

import {
  isPageTransitionPath,
  shouldSkipTraversalTransition,
} from "@/lib/page-transitions";

test("public pages cross-fade, the admin area does not", () => {
  assert.equal(isPageTransitionPath("/"), true);
  assert.equal(isPageTransitionPath("/online/choreo"), true);
  assert.equal(isPageTransitionPath("/administrator-notes"), true);
  assert.equal(isPageTransitionPath("/admin"), false);
  assert.equal(isPageTransitionPath("/admin/invite-links"), false);
  assert.equal(isPageTransitionPath(null), false);
});

test("a traversal is cross-faded only when the browser says it did not animate it", () => {
  assert.equal(shouldSkipTraversalTransition(false), false);
  assert.equal(shouldSkipTraversalTransition(true), true);
  assert.equal(shouldSkipTraversalTransition(undefined), true);
});
