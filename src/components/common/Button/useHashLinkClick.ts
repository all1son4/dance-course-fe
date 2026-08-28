"use client";

import type { AnchorHTMLAttributes } from "react";

import { HASH_PREFIX } from "@/lib/button-navigation";
import { getHashTargetFromHref, scrollToHashTarget } from "@/lib/scroll";

type LinkClickHandler = NonNullable<AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]>;

type UseHashLinkClickOptions = {
  href: string;
  isDisabled: boolean | undefined;
  onLinkClick: AnchorHTMLAttributes<HTMLAnchorElement>["onClick"];
};

/**
 * Click handler for a same-tab `#target` link: scrolls to the target with the
 * site's header offset and updates the URL hash without a navigation. Falls
 * back to the browser's own jump when the target does not exist.
 */
export const useHashLinkClick = ({
  href,
  isDisabled,
  onLinkClick,
}: UseHashLinkClickOptions): LinkClickHandler => {
  return (event) => {
    if (isDisabled) {
      event.preventDefault();
      return;
    }

    onLinkClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    const hashTargetId = getHashTargetFromHref(href);

    if (!hashTargetId) {
      return;
    }

    if (!scrollToHashTarget(hashTargetId)) {
      return;
    }

    event.preventDefault();

    const nextHash = `${HASH_PREFIX}${hashTargetId}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  };
};
