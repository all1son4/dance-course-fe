import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getNavigationType,
  getRememberedScrollOffset,
  getScrollRestorationKey,
  parseScrollOffsetStore,
  planRouteScroll,
  rememberScrollOffset,
  replayScrollOffset,
  SCROLL_OFFSET_STORE_LIMIT,
  SCROLL_REPLAY_MAX_FRAMES,
  serializeScrollOffsetStore,
  shouldRestoreOnLoad,
} from "./scroll-restoration";

/** A window whose scroll clamps to a document height that can grow between frames. */
const createScrollHost = (documentHeight: number) => {
  const frames: Array<() => void> = [];
  const host = {
    documentHeight,
    scrollY: 0,
    scrollToCalls: [] as Array<{ left: number; top: number }>,
    cancelled: [] as number[],
    scrollTo(options: ScrollToOptions) {
      const left = options.left ?? 0;
      const top = options.top ?? 0;

      host.scrollToCalls.push({ left, top });
      host.scrollY = Math.min(top, host.documentHeight);
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.push(() => callback(0));

      return frames.length;
    },
    cancelAnimationFrame(id: number) {
      host.cancelled.push(id);
      frames[id - 1] = () => {};
    },
    runFrame() {
      const next = frames.shift();

      next?.();
    },
    get pendingFrames() {
      return frames.length;
    },
  };

  return host;
};

describe("getScrollRestorationKey", () => {
  it("keeps search and hash so sibling history entries stay apart", () => {
    assert.equal(getScrollRestorationKey({ pathname: "/", search: "", hash: "" }), "/");
    assert.equal(
      getScrollRestorationKey({ pathname: "/ru", search: "?ref=ig", hash: "#contacts" }),
      "/ru?ref=ig#contacts",
    );
    assert.notEqual(
      getScrollRestorationKey({ pathname: "/", search: "", hash: "#contacts" }),
      getScrollRestorationKey({ pathname: "/", search: "", hash: "" }),
    );
  });
});

describe("parseScrollOffsetStore", () => {
  it("round-trips a serialized store", () => {
    const store = rememberScrollOffset({}, "/online", { x: 0, y: 1234 });

    assert.deepEqual(parseScrollOffsetStore(serializeScrollOffsetStore(store)), store);
  });

  it("treats missing, malformed or foreign data as an empty store", () => {
    assert.deepEqual(parseScrollOffsetStore(null), {});
    assert.deepEqual(parseScrollOffsetStore(""), {});
    assert.deepEqual(parseScrollOffsetStore("{not json"), {});
    assert.deepEqual(parseScrollOffsetStore("[1,2]"), {});
    assert.deepEqual(parseScrollOffsetStore('"text"'), {});
  });

  it("drops entries that are not well-formed offsets and keeps the rest", () => {
    const parsed = parseScrollOffsetStore(
      JSON.stringify({
        "/": { x: 0, y: 320 },
        "/online": { y: 10 },
        "/offline": { x: "0", y: 5 },
        "/faq": { x: -1, y: 5 },
        "/nan": { x: 0, y: Number.NaN },
        "/null": null,
      }),
    );

    assert.deepEqual(parsed, { "/": { x: 0, y: 320 } });
  });
});

describe("rememberScrollOffset", () => {
  it("does not mutate the store it is given", () => {
    const store = { "/": { x: 0, y: 10 } };
    const next = rememberScrollOffset(store, "/online", { x: 0, y: 20 });

    assert.deepEqual(store, { "/": { x: 0, y: 10 } });
    assert.deepEqual(next, { "/": { x: 0, y: 10 }, "/online": { x: 0, y: 20 } });
  });

  it("rounds sub-pixel offsets", () => {
    const store = rememberScrollOffset({}, "/", { x: 0.4, y: 812.6 });

    assert.deepEqual(getRememberedScrollOffset(store, "/"), { x: 0, y: 813 });
  });

  it("moves a re-remembered key to the newest position with its new offset", () => {
    let store = rememberScrollOffset({}, "/", { x: 0, y: 100 });
    store = rememberScrollOffset(store, "/online", { x: 0, y: 200 });
    store = rememberScrollOffset(store, "/", { x: 0, y: 300 });

    assert.deepEqual(Object.keys(store), ["/online", "/"]);
    assert.deepEqual(getRememberedScrollOffset(store, "/"), { x: 0, y: 300 });
  });

  it("evicts the oldest entries beyond the limit", () => {
    let store = {};

    for (let index = 0; index < SCROLL_OFFSET_STORE_LIMIT + 3; index += 1) {
      store = rememberScrollOffset(store, `/page-${index}`, { x: 0, y: index });
    }

    assert.equal(Object.keys(store).length, SCROLL_OFFSET_STORE_LIMIT);
    assert.equal(getRememberedScrollOffset(store, "/page-0"), null);
    assert.equal(getRememberedScrollOffset(store, "/page-2"), null);
    assert.deepEqual(getRememberedScrollOffset(store, "/page-3"), { x: 0, y: 3 });
  });

  it("honours a custom limit", () => {
    let store = rememberScrollOffset({}, "/a", { x: 0, y: 1 }, 2);
    store = rememberScrollOffset(store, "/b", { x: 0, y: 2 }, 2);
    store = rememberScrollOffset(store, "/c", { x: 0, y: 3 }, 2);

    assert.deepEqual(Object.keys(store), ["/b", "/c"]);
  });
});

describe("getRememberedScrollOffset", () => {
  it("ignores keys inherited from Object.prototype", () => {
    assert.equal(getRememberedScrollOffset({}, "constructor"), null);
    assert.equal(getRememberedScrollOffset({}, "toString"), null);
  });
});

describe("getNavigationType", () => {
  it("reads the first navigation timing entry", () => {
    assert.equal(getNavigationType([{ type: "reload" }]), "reload");
    assert.equal(getNavigationType([{ type: "back_forward" }]), "back_forward");
    assert.equal(getNavigationType([{ type: "prerender" }]), "prerender");
  });

  it("falls back to a fresh navigation without entries or with an unknown type", () => {
    assert.equal(getNavigationType([]), "navigate");
    assert.equal(getNavigationType([{}]), "navigate");
    assert.equal(getNavigationType([{ type: "something-new" }]), "navigate");
  });
});

describe("shouldRestoreOnLoad", () => {
  const saved = { x: 0, y: 900 };

  it("replays the offset after a reload or a back/forward into a fresh document", () => {
    assert.equal(
      shouldRestoreOnLoad({ navigationType: "reload", scrollY: 0, savedOffset: saved }),
      true,
    );
    assert.equal(
      shouldRestoreOnLoad({
        navigationType: "back_forward",
        scrollY: 0,
        savedOffset: saved,
      }),
      true,
    );
  });

  it("leaves a fresh navigation and a prerender alone", () => {
    assert.equal(
      shouldRestoreOnLoad({ navigationType: "navigate", scrollY: 0, savedOffset: saved }),
      false,
    );
    assert.equal(
      shouldRestoreOnLoad({
        navigationType: "prerender",
        scrollY: 0,
        savedOffset: saved,
      }),
      false,
    );
  });

  it("does not fight a window that already moved (browser restore or the reader)", () => {
    assert.equal(
      shouldRestoreOnLoad({ navigationType: "reload", scrollY: 120, savedOffset: saved }),
      false,
    );
  });

  it("has nothing to do without a remembered offset", () => {
    assert.equal(
      shouldRestoreOnLoad({ navigationType: "reload", scrollY: 0, savedOffset: null }),
      false,
    );
  });
});

describe("planRouteScroll", () => {
  it("restores a traversal's offset, even on a hash URL", () => {
    assert.deepEqual(
      planRouteScroll({ traversalOffset: { x: 0, y: 640 }, hashTargetId: "contacts" }),
      { kind: "restore", offset: { x: 0, y: 640 } },
    );
  });

  it("opens a new page at its hash target", () => {
    assert.deepEqual(
      planRouteScroll({ traversalOffset: null, hashTargetId: "contacts" }),
      {
        kind: "hash",
        targetId: "contacts",
      },
    );
  });

  it("opens a new page at the top otherwise", () => {
    assert.deepEqual(planRouteScroll({ traversalOffset: null, hashTargetId: null }), {
      kind: "top",
    });
  });
});

describe("replayScrollOffset", () => {
  it("scrolls once and stops when the page is already tall enough", () => {
    const host = createScrollHost(5000);

    replayScrollOffset({ x: 0, y: 1200 }, host);

    assert.deepEqual(host.scrollToCalls, [{ left: 0, top: 1200 }]);
    assert.equal(host.pendingFrames, 0);
  });

  it("keeps trying on following frames until the page has grown to the offset", () => {
    const host = createScrollHost(400);

    replayScrollOffset({ x: 0, y: 1200 }, host);
    assert.equal(host.scrollY, 400);
    assert.equal(host.pendingFrames, 1);

    host.runFrame();
    assert.equal(host.pendingFrames, 1);

    host.documentHeight = 3000;
    host.runFrame();
    assert.equal(host.scrollY, 1200);
    assert.equal(host.scrollToCalls.length, 3);
    assert.equal(host.pendingFrames, 0);
  });

  it("gives up after the frame budget", () => {
    const host = createScrollHost(100);

    replayScrollOffset({ x: 0, y: 1200 }, host);

    while (host.pendingFrames > 0) {
      host.runFrame();
    }

    assert.equal(host.scrollToCalls.length, SCROLL_REPLAY_MAX_FRAMES);
  });

  it("can be cancelled between frames", () => {
    const host = createScrollHost(100);
    const cancel = replayScrollOffset({ x: 0, y: 1200 }, host);

    cancel();
    host.runFrame();

    assert.deepEqual(host.cancelled, [1]);
    assert.equal(host.scrollToCalls.length, 1);
  });
});
