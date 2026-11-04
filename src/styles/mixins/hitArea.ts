import { css } from "styled-components";

/** WCAG 2.5.5 / Apple HIG minimum comfortable touch target. */
export const MIN_TAP_TARGET_PX = 44;

type HitAreaOptions = {
  /** Which pseudo-element carries the hit area (pick the free one). */
  pseudo?: "before" | "after";
  /**
   * Upper bound for the hit-area width, any CSS length. Use it where
   * neighbours sit closer than the target size so two hit areas never
   * overlap (e.g. half the gap on each side).
   */
  maxWidth?: string;
  /** Same as `maxWidth`, vertically. */
  maxHeight?: string;
};

/**
 * Grows the tappable area of a small control to at least 44x44px without
 * changing what is painted or the space it takes in the layout: a transparent,
 * absolutely positioned pseudo-element centred on the control. Pointer events
 * on a pseudo-element go to its element, so taps on the halo act exactly like
 * taps on the control itself; focus rings stay on the element.
 *
 * The control must be a containing block (`position: relative` or similar),
 * must not clip its own overflow, and must not already use the chosen
 * pseudo-element.
 */
export const hitArea = ({ pseudo = "after", maxWidth, maxHeight }: HitAreaOptions = {}) => {
  const minWidth = maxWidth
    ? `min(${MIN_TAP_TARGET_PX}px, ${maxWidth})`
    : `${MIN_TAP_TARGET_PX}px`;
  const minHeight = maxHeight
    ? `min(${MIN_TAP_TARGET_PX}px, ${maxHeight})`
    : `${MIN_TAP_TARGET_PX}px`;

  return css`
    &::${pseudo} {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: max(100%, ${minWidth});
      height: max(100%, ${minHeight});
      transform: translate(-50%, -50%);
      background: transparent;
    }
  `;
};
