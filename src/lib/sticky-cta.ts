/**
 * The sticky call to action mirrors a primary CTA that already exists on the
 * page. It only shows once the reader has scrolled past such a CTA and none
 * of them is on screen, and it never competes with something that already
 * owns the screen (cookie banner, a dialog, a footer that fills the view).
 */
export const STICKY_CTA_ANCHOR_ATTRIBUTE = "data-sticky-cta-anchor";
export const STICKY_CTA_ANCHOR_SELECTOR = `[${STICKY_CTA_ANCHOR_ATTRIBUTE}]`;

/** Spread onto the on-page CTA the sticky bar duplicates. */
export const stickyCtaAnchorProps = { [STICKY_CTA_ANCHOR_ATTRIBUTE]: "" } as const;

/**
 * Any floating panel that is not a scroll-locking dialog (the birthday popup,
 * for one) marks itself with this attribute while mounted; the sticky bar
 * stays hidden as long as such a panel is on screen.
 */
export const STICKY_CTA_BLOCKER_ATTRIBUTE = "data-sticky-cta-blocker";
export const STICKY_CTA_BLOCKER_SELECTOR = `[${STICKY_CTA_BLOCKER_ATTRIBUTE}]`;
export const stickyCtaBlockerProps = { [STICKY_CTA_BLOCKER_ATTRIBUTE]: "" } as const;

export type StickyCtaVisibilityInput = {
  /** Anchors found on the page. Zero anchors means nothing to mirror. */
  anchorCount: number;
  /** Anchors currently intersecting the viewport (below the fixed header). */
  anchorsInView: number;
  /**
   * The reader has already scrolled past at least one anchor (it was on
   * screen and left, or the page opened below it). Until then the bar would
   * be advertising a button the reader has not even reached yet.
   */
  hasPassedAnchor: boolean;
  /** IntersectionObserver has reported at least once; avoids a first-paint flash. */
  hasMeasured: boolean;
  isCookieBannerVisible: boolean;
  /** Any scroll-locking dialog (Radix) or blocker panel is open. */
  isDialogOpen: boolean;
  /**
   * The footer has pushed the docked bar too far up the screen (tall phone
   * footers); the bar fades out rather than hanging mid-screen. Normally it
   * just rides up above the footer.
   */
  isFooterCoveringViewport: boolean;
};

export const shouldShowStickyCta = ({
  anchorCount,
  anchorsInView,
  hasMeasured,
  hasPassedAnchor,
  isCookieBannerVisible,
  isDialogOpen,
  isFooterCoveringViewport,
}: StickyCtaVisibilityInput): boolean =>
  hasMeasured &&
  anchorCount > 0 &&
  anchorsInView === 0 &&
  hasPassedAnchor &&
  !isFooterCoveringViewport &&
  !isDialogOpen &&
  !isCookieBannerVisible;

/**
 * How far (px) the bar has to rise so its bottom edge stays `gap` above the
 * footer's top edge. `restingBottom` is where the bar's bottom edge sits when
 * not lifted; `footerTop` is the footer's current top, both in viewport
 * coordinates. Never negative: below the footer's reach the bar rests.
 */
export const computeStickyCtaLift = ({
  footerTop,
  gap,
  restingBottom,
}: {
  footerTop: number;
  gap: number;
  restingBottom: number;
}): number => Math.max(0, Math.round(restingBottom - (footerTop - gap)));
