/**
 * Scroll reveal and image fade: the pure, testable half. The DOM half is
 * `components/common/Reveal/RevealController`, mounted once in the locale
 * layout.
 *
 * Marking is declarative and server-safe: spread `revealTargetProps` onto an
 * element that should fade up when it scrolls in, `revealGroupProps()` onto a
 * container whose children should follow each other, `imageFadeProps` onto an
 * `<img>` that should fade in once it has loaded. The markers are plain
 * attributes in the server HTML; nothing is hidden by them.
 *
 * State: the controller sets `data-reveal="pending"` on an element waiting
 * below the fold, `data-reveal="in"` while its entrance runs, and removes the
 * attribute afterwards - so before JavaScript, under reduced motion, without
 * IntersectionObserver and once settled, an element is exactly as authored.
 * The states are styled in globals.css; a component can replace the default
 * fade-up with its own choreography (see ProgramRoadmap).
 */
export const REVEAL_TARGET_ATTRIBUTE = "data-reveal-target";
export const REVEAL_GROUP_ATTRIBUTE = "data-reveal-group";
export const FADE_TARGET_ATTRIBUTE = "data-fade-target";

export const REVEAL_STATE_ATTRIBUTE = "data-reveal";
export const FADE_STATE_ATTRIBUTE = "data-fade";
export const REVEAL_DELAY_PROPERTY = "--reveal-delay";

/** Siblings that enter the viewport together start this far apart. */
export const REVEAL_STAGGER_MS = 60;
/** The observer fires once the element's top edge clears the bottom 10% of the viewport. */
export const REVEAL_ROOT_MARGIN = "0px 0px -10% 0px";
/**
 * The state attribute is removed when the element's own transform transition
 * ends; this timer is the fallback for choreographies that animate children
 * only (no `transitionend` on the element itself) and for a background tab.
 * It must cover the longest transition + delay any reveal defines in CSS.
 */
export const REVEAL_SETTLE_FALLBACK_MS = 1000;
/** Must cover the `[data-fade="in"]` transition in globals.css. */
export const FADE_SETTLE_MS = 600;

export type RevealTargetProps = { [REVEAL_TARGET_ATTRIBUTE]?: string };
export type RevealGroupProps = { [REVEAL_GROUP_ATTRIBUTE]?: string };
export type ImageFadeProps = { [FADE_TARGET_ATTRIBUTE]?: string };

export const revealTargetProps: RevealTargetProps = { [REVEAL_TARGET_ATTRIBUTE]: "" };
export const revealGroupProps = (staggerMs = REVEAL_STAGGER_MS): RevealGroupProps => ({
  [REVEAL_GROUP_ATTRIBUTE]: String(staggerMs),
});
export const imageFadeProps: ImageFadeProps = { [FADE_TARGET_ATTRIBUTE]: "" };

/** The stagger a group marker carries, falling back to the default for an empty or malformed value. */
export const parseGroupStagger = (value: string | null): number => {
  const parsed = Number(value);

  return value !== null && value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : REVEAL_STAGGER_MS;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

export const canReveal = (): boolean =>
  typeof window !== "undefined" &&
  "IntersectionObserver" in window &&
  !prefersReducedMotion();

type ViewportRect = { top: number; bottom: number };

/**
 * Whether an element should skip the entrance and simply be visible.
 *
 * Two cases: it is on screen right now (the server HTML already painted it -
 * hiding it at hydration would blink), or it sits within the first screen of
 * the document. The second case covers client-side navigation: the new page
 * is scanned while the window is still scrolled to wherever the previous page
 * was, and only afterwards does the router scroll to the top.
 */
export const shouldStartRevealed = (
  rect: ViewportRect,
  scrollY: number,
  viewportHeight: number,
): boolean =>
  (rect.bottom > 0 && rect.top < viewportHeight) || rect.top + scrollY < viewportHeight;

export type RevealWaveItem<TGroup> = {
  top: number;
  left: number;
  /** Members of one group stagger against each other; `null` reveals alone. */
  group: TGroup | null;
  staggerMs: number;
};

/**
 * Elements that intersect in the same observer callback form one wave: in
 * reading order, each member of a group starts `staggerMs` after the previous
 * member of that group. Elements outside any group start at once.
 */
export const assignWaveDelays = <TGroup, T extends RevealWaveItem<TGroup>>(
  hits: readonly T[],
): Array<{ item: T; delayMs: number }> => {
  const ordered = [...hits].sort((a, b) => a.top - b.top || a.left - b.left);
  const positionInGroup = new Map<TGroup, number>();

  return ordered.map((item) => {
    if (item.group === null) {
      return { item, delayMs: 0 };
    }

    const position = positionInGroup.get(item.group) ?? 0;
    positionInGroup.set(item.group, position + 1);

    return { item, delayMs: position * item.staggerMs };
  });
};
