import { Fragment, type ReactNode } from "react";

import StructuredData from "@/components/common/StructuredData";
import { buildBreadcrumbStructuredData } from "@/lib/seo";

import {
  LegalContactLine,
  LegalContent,
  LegalDescription,
  LegalEmail,
  LegalItem,
  LegalItems,
  LegalItemText,
  LegalItemTitle,
  LegalSection,
  LegalTitle,
} from "./LegalDocument.styles";

export const LEGAL_CONTACT_EMAIL = "kroxxxxx92@gmail.com";

type LegalDocumentItem = {
  id: number | string;
  title: string;
  text: string;
};

type LegalDocumentProps = {
  /** Route of the page, for the breadcrumb structured data. */
  path: string;
  title: string;
  description: string;
  /** Whether occurrences of the contact email in `description` become mailto links. */
  linkEmailInDescription?: boolean;
  items: LegalDocumentItem[];
  contactLine: string;
};

/** Turns every occurrence of the contact email inside `text` into a mailto link. */
const renderTextWithEmail = (text: string): ReactNode =>
  text.split(LEGAL_CONTACT_EMAIL).map((part, index, parts) => (
    <Fragment key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 && (
        <LegalEmail href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </LegalEmail>
      )}
    </Fragment>
  ));

/** The privacy and cookie policies: one white slab with a title, intro, sections and a contact line. */
export default function LegalDocument({
  contactLine,
  description,
  items,
  linkEmailInDescription = false,
  path,
  title,
}: LegalDocumentProps) {
  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: title, path },
        ])}
      />
      <LegalSection>
        <LegalContent>
          <LegalTitle>{title}</LegalTitle>
          <LegalDescription>
            {linkEmailInDescription ? renderTextWithEmail(description) : description}
          </LegalDescription>
          <LegalItems>
            {items.map((item) => (
              <LegalItem key={item.id}>
                <LegalItemTitle>{item.title}</LegalItemTitle>
                <LegalItemText>{item.text}</LegalItemText>
              </LegalItem>
            ))}
          </LegalItems>
          <LegalContactLine>{renderTextWithEmail(contactLine)}</LegalContactLine>
        </LegalContent>
      </LegalSection>
    </>
  );
}
