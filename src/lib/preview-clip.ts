/**
 * Card preview clips: the pure, testable half. The DOM half is
 * `components/other/PreviewClip`.
 *
 * A preview clip is a short, silent, looping MP4 that plays over a card's
 * poster - on hover where there is a mouse, while the media is mostly on screen
 * on touch devices - and is never fetched for visitors who asked for less
 * motion or less data.
 */

export type PreviewClipMode =
  /** Never load or play the clip; the poster stays. */
  | "off"
  /** Mouse/trackpad: play while the card is hovered. */
  | "hover"
  /** Touch: play while the card is mostly in view. */
  | "in-view";

export type PreviewClipEnvironment = {
  canHover: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
};

/**
 * Marks the element whose hover (mouse) or visibility (touch) drives the
 * clip - the whole card, not just its media box. Without one, the clip's own
 * parent is used. Lives here, not in the client component, so server
 * components can spread it.
 */
export const PREVIEW_CLIP_ROOT_ATTRIBUTE = "data-preview-clip-root";
export const previewClipRootProps = { [PREVIEW_CLIP_ROOT_ATTRIBUTE]: "" } as const;

/** The media query that tells a mouse/trackpad apart from a touch screen. */
export const PREVIEW_CLIP_HOVER_QUERY = "(hover: hover) and (pointer: fine)";
export const PREVIEW_CLIP_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * How close to the viewport a card must come before the clip's `src` is set.
 * With preload="none" setting it fetches nothing yet; it only lets a hover or
 * an in-view start begin without waiting for a re-render.
 */
export const PREVIEW_CLIP_NEAR_ROOT_MARGIN = "300px 0px";

/**
 * How long a card must stay hovered or in view before its clip starts. Passing
 * over a card or flicking past it should leave the poster alone.
 */
export const PREVIEW_CLIP_START_DELAY_MS = 700;

/**
 * Top inset for the in-view check, so media sliding under the fixed header
 * does not count as seen.
 */
export const PREVIEW_CLIP_IN_VIEW_ROOT_MARGIN = "-72px 0px 0px 0px";

/** A refused or interrupted `play()` is tried again this many times per view. */
export const PREVIEW_CLIP_MAX_PLAY_RETRIES = 3;

/** Share of the clip's own media box that must be on screen for a touch preview. */
export const PREVIEW_CLIP_IN_VIEW_RATIO = 0.6;

/** Intersection thresholds fine enough to notice crossing the in-view ratio. */
export const PREVIEW_CLIP_IN_VIEW_THRESHOLDS = [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1];

export const resolvePreviewClipMode = ({
  canHover,
  prefersReducedMotion,
  saveData,
}: PreviewClipEnvironment): PreviewClipMode => {
  if (prefersReducedMotion || saveData) {
    return "off";
  }

  return canHover ? "hover" : "in-view";
};

export type PreviewClipVisibility = {
  /** `IntersectionObserverEntry.intersectionRatio` of the media box. */
  ratio: number;
  /** Visible height of the media box, px (`intersectionRect.height`). */
  visibleHeight: number;
  /** Viewport height, px (`rootBounds.height`, or `innerHeight`). */
  viewportHeight: number;
};

/**
 * Whether a touch preview should be playing. Media taller than the viewport
 * can never be 60% visible, so media that fills 60% of the screen counts as in
 * view as well.
 */
export const isPreviewClipInView = ({
  ratio,
  visibleHeight,
  viewportHeight,
}: PreviewClipVisibility): boolean => {
  if (ratio <= 0 || visibleHeight <= 0) {
    return false;
  }

  if (ratio >= PREVIEW_CLIP_IN_VIEW_RATIO) {
    return true;
  }

  return (
    viewportHeight > 0 && visibleHeight >= viewportHeight * PREVIEW_CLIP_IN_VIEW_RATIO
  );
};
