"use client";

import type { AnchorHTMLAttributes } from "react";

import { type ButtonAnalyticsMetadata, trackCtaClick } from "@/lib/mixpanel-analytics";

type TrackedAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  analytics: ButtonAnalyticsMetadata;
  href: string;
};

/**
 * A plain `<a>` that reports `cta_clicked` like the shared Button does, so a
 * server-rendered inline link can be tracked without changing its markup.
 */
export default function TrackedAnchor({
  analytics,
  onClick,
  ...anchorProps
}: TrackedAnchorProps) {
  return (
    <a
      {...anchorProps}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          void trackCtaClick(analytics, anchorProps.href);
        }
      }}
    />
  );
}
