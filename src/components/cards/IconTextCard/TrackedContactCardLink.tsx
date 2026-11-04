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
      target="_blank"
      rel="noopener noreferrer"
      href={href}
      onClick={() => {
        void trackCtaClick(analytics, href);
      }}
    >
      {children}
    </ContactCardLink>
  );
}
