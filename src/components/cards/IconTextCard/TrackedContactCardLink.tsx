"use client";

import type { ReactNode } from "react";

import { type ButtonAnalyticsMetadata, trackCtaClick } from "@/lib/mixpanel-analytics";

import { ContactCardLink } from "./IconTextCard.styles";

type TrackedContactCardLinkProps = {
  analytics: ButtonAnalyticsMetadata;
  children: ReactNode;
  href: string;
};

/** The contact row link with `cta_clicked` tracking; markup matches the untracked one. */
export default function TrackedContactCardLink({
  analytics,
  children,
  href,
}: TrackedContactCardLinkProps) {
  return (
    <ContactCardLink
      // tel:/mailto: open the dialer or mail app in place; a new tab stays empty.
      {...(/^https?:/u.test(href)
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      href={href}
      onClick={() => {
        void trackCtaClick(analytics, href);
      }}
    >
      {children}
    </ContactCardLink>
  );
}
