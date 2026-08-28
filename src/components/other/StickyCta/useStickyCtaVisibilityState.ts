"use client";

import { useEffect, useState } from "react";

import {
  STICKY_CTA_ANCHOR_SELECTOR,
  STICKY_CTA_BLOCKER_SELECTOR,
} from "@/lib/sticky-cta";

/**
 * Fixed header (top offset + height) that covers the top of the viewport. An
 * anchor hiding entirely behind it does not count as "in view".
 */
const HEADER_CLEARANCE_PX = 110;
/**
 * The bar rides up with the footer (CSS sticky, see StickyCtaViewport) only
 * this far (share of viewport height); past it the pill would hang
 * mid-screen, so it fades out instead. Desktop footers lift it ~250px of 900
 * and stay; the tall phone footer pushes past the cap and the bar hands the
 * screen over to the footer.
 */
const FOOTER_LIFT_HIDE_RATIO = 0.4;
/** Footer visibility is sampled at these shares of its own height. */
const FOOTER_THRESHOLDS = Array.from({ length: 21 }, (_, index) => index / 20);
const SCROLL_LOCK_ATTRIBUTE = "data-scroll-locked";
const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"]';

export type StickyCtaVisibilityState = {
  anchorCount: number;
  anchorsInView: number;
  hasMeasured: boolean;
  hasPassedAnchor: boolean;
  isDialogOpen: boolean;
  isFooterCoveringViewport: boolean;
};

const INITIAL_STATE: StickyCtaVisibilityState = {
  anchorCount: 0,
  anchorsInView: 0,
  hasMeasured: false,
  hasPassedAnchor: false,
  isDialogOpen: false,
  isFooterCoveringViewport: false,
};

const isAnyDialogOpen = (): boolean =>
  document.body.hasAttribute(SCROLL_LOCK_ATTRIBUTE) ||
  document.querySelector(OPEN_DIALOG_SELECTOR) !== null ||
  document.querySelector(STICKY_CTA_BLOCKER_SELECTOR) !== null;

/**
 * Tracks the on-page CTA anchors, the footer and open dialogs. Everything is
 * observer-driven: the bar's docking above the footer is done by CSS sticky
 * positioning, so scrolling costs no JavaScript at all; the only footer
 * question left is "does it cover too much of the screen", answered by an
 * IntersectionObserver with fine thresholds. Without IntersectionObserver
 * support nothing measures and the bar stays hidden.
 */
export const useStickyCtaVisibilityState = (): StickyCtaVisibilityState => {
  const [state, setState] = useState<StickyCtaVisibilityState>(INITIAL_STATE);

  useEffect(() => {
    if (
      typeof IntersectionObserver === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }

    const anchors = Array.from(document.querySelectorAll(STICKY_CTA_ANCHOR_SELECTOR));
    const footer = document.querySelector("footer");
    const anchorsInView = new Set<Element>();
    const passedAnchors = new Set<Element>();
    let isFooterCoveringViewport = false;

    const commit = () => {
      setState((previous) => {
        const next: StickyCtaVisibilityState = {
          anchorCount: anchors.length,
          anchorsInView: anchorsInView.size,
          hasMeasured: true,
          hasPassedAnchor: passedAnchors.size > 0,
          isDialogOpen: previous.isDialogOpen,
          isFooterCoveringViewport,
        };

        // Same values -> same object -> React skips the render.
        return previous.anchorCount === next.anchorCount &&
          previous.anchorsInView === next.anchorsInView &&
          previous.hasMeasured === next.hasMeasured &&
          previous.hasPassedAnchor === next.hasPassedAnchor &&
          previous.isFooterCoveringViewport === next.isFooterCoveringViewport
          ? previous
          : next;
      });
    };

    if (anchors.length === 0) {
      // Nothing to mirror: settle once and install no listeners at all.
      commit();
      return;
    }

    // IntersectionObserver only reports *changes*: an instant jump (anchor
    // link, reduced-motion scroll, a fling on a slow device) can carry an
    // anchor from "below" straight to "above" without ever intersecting, and
    // the observer stays silent. This scroll check covers that gap and
    // unregisters itself the moment the first pass is recorded.
    let passDetectionFrame = 0;

    const stopPassDetection = () => {
      window.removeEventListener("scroll", schedulePassDetection);

      if (passDetectionFrame) {
        window.cancelAnimationFrame(passDetectionFrame);
        passDetectionFrame = 0;
      }
    };

    const detectPassByScroll = () => {
      passDetectionFrame = 0;

      for (const anchor of anchors) {
        if (anchor.getBoundingClientRect().bottom < HEADER_CLEARANCE_PX) {
          passedAnchors.add(anchor);
        }
      }

      if (passedAnchors.size > 0) {
        stopPassDetection();
        commit();
      }
    };

    function schedulePassDetection() {
      if (!passDetectionFrame) {
        passDetectionFrame = window.requestAnimationFrame(detectPassByScroll);
      }
    }

    window.addEventListener("scroll", schedulePassDetection, { passive: true });

    const syncFooterCoverage = (entry: IntersectionObserverEntry) => {
      const nextCovering =
        entry.isIntersecting &&
        entry.intersectionRect.height > window.innerHeight * FOOTER_LIFT_HIDE_RATIO;

      if (nextCovering !== isFooterCoveringViewport) {
        isFooterCoveringViewport = nextCovering;
        commit();
      }
    };

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === footer) {
            syncFooterCoverage(entry);
            continue;
          }

          if (entry.isIntersecting) {
            anchorsInView.add(entry.target);
            continue;
          }

          // Leaving the viewport after being seen, or sitting above it from
          // the start (deep link below the hero): the reader is past it.
          const isAboveViewport =
            entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);

          if (anchorsInView.has(entry.target) || isAboveViewport) {
            passedAnchors.add(entry.target);
            stopPassDetection();
          }

          anchorsInView.delete(entry.target);
        }

        commit();
      },
      { rootMargin: `-${HEADER_CLEARANCE_PX}px 0px 0px 0px`, threshold: 0 },
    );

    for (const anchor of anchors) {
      intersectionObserver.observe(anchor);
    }

    // Separate observer: the footer needs the fine thresholds, the anchors only
    // "any part visible".
    const footerObserver = footer
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              syncFooterCoverage(entry);
            }
          },
          { threshold: FOOTER_THRESHOLDS },
        )
      : null;

    footerObserver?.observe(footer as Element);

    let dialogCheckFrame = 0;

    const syncDialogState = () => {
      dialogCheckFrame = 0;
      const isDialogOpen = isAnyDialogOpen();

      setState((previous) =>
        previous.isDialogOpen === isDialogOpen ? previous : { ...previous, isDialogOpen },
      );
    };

    // Radix dialogs portal into <body> and lock scroll on it; blocker panels
    // (see STICKY_CTA_BLOCKER_ATTRIBUTE) mount anywhere in the tree, hence the
    // subtree watch. Mutations arrive in bursts (typing, a video player's
    // UI), so the check itself - three querySelectors - runs at most once per
    // frame and bails out when nothing changed.
    const mutationObserver = new MutationObserver(() => {
      if (!dialogCheckFrame) {
        dialogCheckFrame = window.requestAnimationFrame(syncDialogState);
      }
    });
    mutationObserver.observe(document.body, {
      attributeFilter: [SCROLL_LOCK_ATTRIBUTE, "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    syncDialogState();

    return () => {
      intersectionObserver.disconnect();
      footerObserver?.disconnect();
      mutationObserver.disconnect();

      if (dialogCheckFrame) {
        window.cancelAnimationFrame(dialogCheckFrame);
      }

      stopPassDetection();
    };
  }, []);

  return state;
};
