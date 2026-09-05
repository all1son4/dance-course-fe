/**
 * Window scroll offsets per history entry, so Back/Forward, a reload and a
 * return from another site land where the reader left off.
 *
 * The app router swaps pages asynchronously, so the browser's own restoration
 * for an in-app traversal would fire against the page being left and clamp
 * to its height; `Header` therefore keeps `history.scrollRestoration` on
 * "manual" while the app runs and replays the offsets kept here. The pure
 * half (keys, the store, the decisions) lives in this file and is unit
 * tested; `Header` wires it to the DOM.
 */
export type ScrollOffset = { x: number; y: number };

/** Insertion-ordered: the oldest key is the first one, and the first to go. */
export type ScrollOffsetStore = Record<string, ScrollOffset>;

export const SCROLL_OFFSET_STORAGE_KEY = "scroll-restoration:v1";
/** Enough for a long browsing session; keeps the sessionStorage entry small. */
export const SCROLL_OFFSET_STORE_LIMIT = 50;

type LocationLike = { pathname: string; search: string; hash: string };

/** Hash included: `/` and `/#contacts` are separate history entries. */
export const getScrollRestorationKey = ({
  pathname,
  search,
  hash,
}: LocationLike): string => `${pathname}${search}${hash}`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toScrollOffset = (value: unknown): ScrollOffset | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { x, y } = value as Partial<ScrollOffset>;

  return isFiniteNumber(x) && isFiniteNumber(y) && x >= 0 && y >= 0 ? { x, y } : null;
};

/** Anything that is not a map of well-formed offsets is treated as empty. */
export const parseScrollOffsetStore = (
  raw: string | null | undefined,
): ScrollOffsetStore => {
  if (!raw) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const store: ScrollOffsetStore = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const offset = toScrollOffset(value);

    if (offset) {
      store[key] = offset;
    }
  }

  return store;
};

export const serializeScrollOffsetStore = (store: ScrollOffsetStore): string =>
  JSON.stringify(store);

/**
 * Returns a new store with `key` as its newest entry (re-remembering a key
 * moves it to the end), dropping the oldest entries beyond the limit.
 */
export const rememberScrollOffset = (
  store: ScrollOffsetStore,
  key: string,
  offset: ScrollOffset,
  limit = SCROLL_OFFSET_STORE_LIMIT,
): ScrollOffsetStore => {
  const entries = Object.entries(store).filter(([storedKey]) => storedKey !== key);

  entries.push([key, { x: Math.round(offset.x), y: Math.round(offset.y) }]);

  return Object.fromEntries(entries.slice(Math.max(0, entries.length - limit)));
};

export const getRememberedScrollOffset = (
  store: ScrollOffsetStore,
  key: string,
): ScrollOffset | null =>
  Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;

/** `PerformanceNavigationTiming.type`; unknown strings are treated as a fresh navigation. */
export type NavigationType = "navigate" | "reload" | "back_forward" | "prerender";

export const getNavigationType = (
  entries: ReadonlyArray<{ type?: string }>,
): NavigationType => {
  const type = entries[0]?.type;

  return type === "reload" || type === "back_forward" || type === "prerender"
    ? type
    : "navigate";
};

type LoadRestoreInput = {
  navigationType: NavigationType;
  /** Where the window is once the app has hydrated. */
  scrollY: number;
  savedOffset: ScrollOffset | null;
};

/**
 * A fresh document only gets an offset replayed for a reload or a
 * back/forward into it, and only while the window is still at the top - if
 * the browser restored on its own, or the reader already scrolled during
 * hydration, the page is left where it is.
 */
export const shouldRestoreOnLoad = ({
  navigationType,
  scrollY,
  savedOffset,
}: LoadRestoreInput): boolean =>
  (navigationType === "reload" || navigationType === "back_forward") &&
  scrollY === 0 &&
  savedOffset !== null;

export type RouteScrollPlan =
  | { kind: "restore"; offset: ScrollOffset }
  | { kind: "hash"; targetId: string }
  | { kind: "top" };

type RouteScrollInput = {
  /** The destination entry's remembered offset when this is a Back/Forward. */
  traversalOffset: ScrollOffset | null;
  hashTargetId: string | null;
};

/**
 * What a completed route change scrolls to: a traversal goes back to where
 * the reader was (even on a hash URL - they may have scrolled on since), a
 * new page opens at its hash target or at the top.
 */
export const planRouteScroll = ({
  traversalOffset,
  hashTargetId,
}: RouteScrollInput): RouteScrollPlan => {
  if (traversalOffset) {
    return { kind: "restore", offset: traversalOffset };
  }

  if (hashTargetId) {
    return { kind: "hash", targetId: hashTargetId };
  }

  return { kind: "top" };
};

/** Frames to keep re-applying an offset while the page is still too short for it. */
export const SCROLL_REPLAY_MAX_FRAMES = 10;

/** The slice of `window` the replay needs; a test passes a fake. */
type ScrollHost = {
  scrollTo: (options: ScrollToOptions) => void;
  readonly scrollY: number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

/**
 * Scrolls to `offset` now and, while the document is still too short to
 * reach it (streamed sections filling in below), again on the next frames.
 * Stops as soon as the offset is reached, so the reader's own scrolling is
 * never fought for longer than necessary. Returns a cancel function.
 */
export const replayScrollOffset = (
  offset: ScrollOffset,
  host: ScrollHost,
  maxFrames = SCROLL_REPLAY_MAX_FRAMES,
): (() => void) => {
  let frameId: number | null = null;
  let frames = 0;

  const apply = () => {
    frameId = null;
    host.scrollTo({ left: offset.x, top: offset.y, behavior: "auto" });
    frames += 1;

    if (host.scrollY < offset.y && frames < maxFrames) {
      frameId = host.requestAnimationFrame(apply);
    }
  };

  apply();

  return () => {
    if (frameId !== null) {
      host.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
};
