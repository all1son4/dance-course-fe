"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

import {
  canReveal,
  FADE_SETTLE_MS,
  FADE_STATE_ATTRIBUTE,
  FADE_TARGET_ATTRIBUTE,
  parseGroupStagger,
  prefersReducedMotion,
  REVEAL_DELAY_PROPERTY,
  REVEAL_GROUP_ATTRIBUTE,
  REVEAL_SETTLE_FALLBACK_MS,
  REVEAL_STATE_ATTRIBUTE,
  REVEAL_TARGET_ATTRIBUTE,
  shouldStartRevealed,
} from "@/lib/reveal";

import { observeReveal } from "./reveal-observer";

const MAIN_CONTENT_ID = "main-content";
const REVEAL_SELECTOR = `[${REVEAL_TARGET_ATTRIBUTE}], [${REVEAL_GROUP_ATTRIBUTE}] > *`;
const FADE_SELECTOR = `img[${FADE_TARGET_ATTRIBUTE}]`;

type Cancel = () => void;

const clearRevealState = (element: HTMLElement) => {
  element.removeAttribute(REVEAL_STATE_ATTRIBUTE);
  element.style.removeProperty(REVEAL_DELAY_PROPERTY);
};

/**
 * Hides one element until it scrolls in, plays its entrance, then leaves it
 * exactly as authored. Returns the cancel function.
 */
const armReveal = (element: HTMLElement): Cancel => {
  if (
    shouldStartRevealed(
      element.getBoundingClientRect(),
      window.scrollY,
      window.innerHeight,
    )
  ) {
    return () => {};
  }

  const group = element.parentElement?.hasAttribute(REVEAL_GROUP_ATTRIBUTE)
    ? element.parentElement
    : null;
  const staggerMs = parseGroupStagger(
    group?.getAttribute(REVEAL_GROUP_ATTRIBUTE) ?? null,
  );
  let settleTimer = 0;

  const finish = () => {
    window.clearTimeout(settleTimer);
    element.removeEventListener("transitionend", onTransitionEnd);
    clearRevealState(element);
  };

  const onTransitionEnd = (event: TransitionEvent) => {
    // Children's transitions bubble up; only the element's own transform marks the end.
    if (event.target === element && event.propertyName === "transform") {
      finish();
    }
  };

  element.setAttribute(REVEAL_STATE_ATTRIBUTE, "pending");
  const stopObserving = observeReveal(element, {
    group,
    staggerMs,
    onReveal: (delayMs) => {
      element.style.setProperty(REVEAL_DELAY_PROPERTY, `${delayMs}ms`);
      element.addEventListener("transitionend", onTransitionEnd);
      element.setAttribute(REVEAL_STATE_ATTRIBUTE, "in");
      settleTimer = window.setTimeout(finish, delayMs + REVEAL_SETTLE_FALLBACK_MS);
    },
  });

  return () => {
    stopObserving();
    finish();
  };
};

/**
 * Fades an image in once it has loaded. An image that is already decoded -
 * cached, or loaded before JavaScript ran - is left alone: hiding it would
 * blink. A failed load is shown as it is (its alt text), never hidden.
 */
const armFade = (image: HTMLImageElement): Cancel => {
  if (image.complete) {
    return () => {};
  }

  let settleTimer = 0;

  const finish = () => {
    window.clearTimeout(settleTimer);
    image.removeEventListener("load", onLoad);
    image.removeEventListener("error", finish);
    image.removeAttribute(FADE_STATE_ATTRIBUTE);
  };

  const onLoad = () => {
    image.setAttribute(FADE_STATE_ATTRIBUTE, "in");
    settleTimer = window.setTimeout(finish, FADE_SETTLE_MS);
  };

  image.setAttribute(FADE_STATE_ATTRIBUTE, "pending");
  image.addEventListener("load", onLoad);
  image.addEventListener("error", finish);

  return finish;
};

/**
 * Renders nothing. Scans the page for marked elements (see `lib/reveal`) when
 * it mounts and on every route change, and keeps watching for content that
 * arrives later - streamed Suspense boundaries, client navigations - so those
 * are armed before they are painted (MutationObserver callbacks run before
 * the next frame).
 */
export default function RevealController() {
  const pathname = usePathname();

  // Layout effect on purpose: the "pending" state has to land before the
  // first paint after hydration, or an element would flash and then vanish.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    const root = document.getElementById(MAIN_CONTENT_ID) ?? document.body;
    const revealEnabled = canReveal();
    const cancels = new Map<Element, Cancel>();

    const arm = (scope: Element) => {
      const candidates: Element[] = scope.matches(`${REVEAL_SELECTOR}, ${FADE_SELECTOR}`)
        ? [scope]
        : [];
      candidates.push(...scope.querySelectorAll(`${REVEAL_SELECTOR}, ${FADE_SELECTOR}`));

      for (const candidate of candidates) {
        if (cancels.has(candidate) || !(candidate instanceof HTMLElement)) {
          continue;
        }

        if (candidate instanceof HTMLImageElement && candidate.matches(FADE_SELECTOR)) {
          cancels.set(candidate, armFade(candidate));
        } else if (revealEnabled) {
          cancels.set(candidate, armReveal(candidate));
        }
      }
    };

    arm(root);

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            arm(node);
          }
        }
      }
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      cancels.forEach((cancel) => cancel());
    };
  }, [pathname]);

  return null;
}
