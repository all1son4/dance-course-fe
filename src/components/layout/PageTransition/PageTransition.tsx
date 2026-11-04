"use client";

import { usePathname } from "next/navigation";
import {
  type CSSProperties,
  useEffect,
  useSyncExternalStore,
  ViewTransition,
} from "react";

import {
  isPageTransitionPath,
  PAGE_TRANSITION_MARKER_CLASS,
  PAGE_TRANSITIONS_ENABLED,
  shouldSkipTraversalTransition,
} from "@/lib/page-transitions";

/*
 * A 1px, fully transparent, click-through box. It only exists so that a route
 * change has a <ViewTransition> to enter and exit: that is what makes React
 * wrap the navigation commit in `document.startViewTransition()`. The page
 * content itself is deliberately NOT wrapped. A named content layer is painted
 * above the whole document while the transition runs - over the fixed glass
 * header, the sticky CTA, the cookie banner and open dialogs - and a named
 * header loses its backdrop blur for the duration. Keeping everything in the
 * single `root` snapshot cross-fades the page as one picture, so the chrome,
 * identical in both pictures, does not move or flicker. (Wrapped content
 * would also make React hold every navigation commit for up to ~800ms while
 * the new page's eager <img>s load.)
 *
 * Absolute, not fixed: a fixed box, even an invisible one, changes how Chrome
 * composites the page and shifted anti-aliased edges (video corners) by a few
 * levels in pixel diffs. Out of flow at the document's top-left it changes
 * nothing; it does not need to be on screen to start the transition.
 */
const markerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const subscribeToReducedMotion = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);

  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const getReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const getReducedMotionOnServer = (): boolean => false;

/** Set by a back/forward the browser has already animated; consumed by the next transition. */
let skipNextTransition = false;

const isViewTransitionAnimation = (animation: Animation): boolean => {
  const effect = animation.effect;

  return (
    effect instanceof KeyframeEffect &&
    (effect.pseudoElement?.startsWith("::view-transition") ?? false)
  );
};

/** Jumps the running transition to its end state: the new page, at once. */
const finishTransitionIfSkipped = (): void => {
  if (!skipNextTransition) {
    return;
  }

  skipNextTransition = false;

  for (const animation of document.documentElement.getAnimations({ subtree: true })) {
    if (isViewTransitionAnimation(animation)) {
      try {
        animation.finish();
      } catch {
        // A finished or cancelled animation has nothing left to skip.
      }
    }
  }
};

const useTraversalSkip = (): void => {
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      skipNextTransition = shouldSkipTraversalTransition(event.hasUAVisualTransition);
    };
    // A traversal that changed only the hash starts no transition; the flag
    // must not outlive it and swallow the next ordinary navigation.
    const clearSkip = () => {
      skipNextTransition = false;
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pointerdown", clearSkip, true);
    window.addEventListener("keydown", clearSkip, true);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pointerdown", clearSkip, true);
      window.removeEventListener("keydown", clearSkip, true);
    };
  }, []);
};

/**
 * React cancels the `root` snapshot when nothing outside a <ViewTransition>
 * changed, which here would leave only the invisible marker animating. An
 * inline name tells React the root is ours to animate. Set after hydration,
 * on the client only, so the server HTML stays exactly as before.
 */
const useRootSnapshot = (): void => {
  useEffect(() => {
    const root = document.documentElement;

    if (root.style.viewTransitionName === "") {
      root.style.viewTransitionName = "root";
    }

    return () => {
      if (root.style.viewTransitionName === "root") {
        root.style.viewTransitionName = "";
      }
    };
  }, []);
};

function PageTransitionMarker() {
  const pathname = usePathname();
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionOnServer,
  );

  useTraversalSkip();
  useRootSnapshot();

  if (!isPageTransitionPath(pathname)) {
    return null;
  }

  // Mounting any <ViewTransition> makes React start a transition, even with
  // its classes set to "none" - under reduced motion the marker is a plain
  // element, so a navigation commits exactly as it would without the feature.
  if (prefersReducedMotion) {
    return <span aria-hidden style={markerStyle} />;
  }

  return (
    <ViewTransition
      key={pathname}
      enter={PAGE_TRANSITION_MARKER_CLASS}
      exit={PAGE_TRANSITION_MARKER_CLASS}
      default="none"
      onEnter={finishTransitionIfSkipped}
      onExit={finishTransitionIfSkipped}
    >
      <span aria-hidden style={markerStyle} />
    </ViewTransition>
  );
}

/**
 * Cross-fades the page on every pathname change of the public site. Hash and
 * query changes on the same page do not count, and neither does a locale
 * switch (same pathname; this lives in the root layout, which survives the
 * [locale] segment being replaced). Browser back/forward is committed
 * synchronously by React and is not animated either. Browsers without view
 * transitions and `PAGE_TRANSITIONS_ENABLED = false` navigate exactly as
 * before, and so does reduced motion.
 */
export default function PageTransition() {
  return PAGE_TRANSITIONS_ENABLED ? <PageTransitionMarker /> : null;
}
