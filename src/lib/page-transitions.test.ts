import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordPageTransitions,
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

test("page transitions skip low-end devices and Save-Data", () => {
  assert.equal(canAffordPageTransitions({}), true);
  assert.equal(canAffordPageTransitions({ cores: 8, memoryGb: 8 }), true);
  assert.equal(canAffordPageTransitions({ cores: 2 }), false);
  assert.equal(canAffordPageTransitions({ cores: 8, memoryGb: 2 }), false);
  assert.equal(
    canAffordPageTransitions({ cores: 8, memoryGb: 8, saveData: true }),
    false,
  );
});
