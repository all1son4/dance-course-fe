"use client";

import type { ReactNode } from "react";

import { trackCtaClick } from "@/lib/mixpanel-analytics";

import { LegalEmail } from "./LegalDocument.styles";

type TrackedLegalEmailProps = {
  children: ReactNode;
  href: string;
};

/** The contact mailto link; the click is reported without the address. */
export default function TrackedLegalEmail({ children, href }: TrackedLegalEmailProps) {
  return (
    <LegalEmail
      href={href}
      onClick={() => {
        void trackCtaClick({ id: "contact_email", placement: "legal_document" }, href);
      }}
    >
      {children}
    </LegalEmail>
  );
}
