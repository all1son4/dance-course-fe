import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getLinkRel,
  getRouteKey,
  isInDocumentHashHref,
  isInternalNavigationHref,
  isModifiedClickEvent,
  isSameRoute,
  shouldTrackRouteLoading,
} from "./button-navigation";

const click = (overrides: Partial<Parameters<typeof isModifiedClickEvent>[0]> = {}) => ({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe("isInternalNavigationHref", () => {
  it("accepts root-relative, query and dot-relative hrefs", () => {
    for (const href of ["/online", "?product=x", "./a", "../b"]) {
      assert.equal(isInternalNavigationHref(href), true, href);
    }
  });

  it("rejects hashes, protocol-relative URLs, schemes and empty values", () => {
    for (const href of [
      "",
      "#tariffs",
      "//cdn.example",
      "mailto:a@b.c",
      "tel:+48",
      "https://x.y",
    ]) {
      assert.equal(isInternalNavigationHref(href), false, href);
    }
  });
});

describe("isModifiedClickEvent", () => {
  it("is false for a plain left click", () => {
    assert.equal(isModifiedClickEvent(click()), false);
  });

  it("is true for prevented, non-primary or modifier clicks", () => {
    assert.equal(isModifiedClickEvent(click({ defaultPrevented: true })), true);
    assert.equal(isModifiedClickEvent(click({ button: 1 })), true);
    assert.equal(isModifiedClickEvent(click({ metaKey: true })), true);
    assert.equal(isModifiedClickEvent(click({ shiftKey: true })), true);
  });
});

describe("getLinkRel", () => {
  it("adds noopener noreferrer to new-tab links unless a rel is given", () => {
    assert.equal(getLinkRel("_blank", undefined), "noopener noreferrer");
    assert.equal(getLinkRel("_blank", "nofollow"), "nofollow");
    assert.equal(getLinkRel("_self", undefined), undefined);
    assert.equal(getLinkRel("_self", "nofollow"), "nofollow");
  });
});

describe("isSameRoute", () => {
  const current = "https://site.test/online/group?x=1#tariffs";

  it("ignores the hash but not the query", () => {
    assert.equal(isSameRoute("/online/group?x=1", current), true);
    assert.equal(isSameRoute("/online/group?x=1#top", current), true);
    assert.equal(isSameRoute("/online/group", current), false);
    assert.equal(isSameRoute("/online", current), false);
  });

  it("treats unparseable input as the same route (nothing to load)", () => {
    assert.equal(isSameRoute("/online", "not a url"), true);
  });

  it("keys routes by path and search only", () => {
    assert.equal(getRouteKey("/a", "?b=1"), "/a?b=1");
  });
});

describe("target helpers", () => {
  it("tracks loading only for same-tab in-app links", () => {
    assert.equal(shouldTrackRouteLoading("/online", "_self"), true);
    assert.equal(shouldTrackRouteLoading("/online", "_blank"), false);
    assert.equal(shouldTrackRouteLoading("https://x.y", "_self"), false);
  });

  it("recognises same-tab hash links", () => {
    assert.equal(isInDocumentHashHref("#tariffs", "_self"), true);
    assert.equal(isInDocumentHashHref("#tariffs", "_blank"), false);
    assert.equal(isInDocumentHashHref("/online#tariffs", "_self"), false);
  });
});
