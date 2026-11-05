import { Fragment, type ReactNode } from "react";

import StructuredData from "@/components/common/StructuredData";
import { buildBreadcrumbStructuredData } from "@/lib/seo";

import {
  LegalBody,
  LegalBullet,
  LegalBullets,
  LegalContactLine,
  LegalContent,
  LegalDescription,
  LegalItem,
  LegalItems,
  LegalItemText,
  LegalItemTitle,
  LegalLettered,
  LegalLetteredList,
  LegalLetteredMark,
  LegalLetteredText,
  LegalOutline,
  LegalOutlineLink,
  LegalSection,
  LegalText,
  LegalTitle,
} from "./LegalDocument.styles";
import { parseLegalText } from "./parse-legal-text";
import TrackedLegalEmail from "./TrackedLegalEmail";

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
        <TrackedLegalEmail href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </TrackedLegalEmail>
      )}
    </Fragment>
  ));

/** `name` in a policy is a technical identifier (a cookie, a storage key). */
const renderInlineCode = (text: string): ReactNode =>
  text
    .split(/(`[^`]+`)/)
    .map((part, index) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );

const renderBullets = (items: string[]) => (
  <LegalBullets>
    {items.map((item) => (
      <LegalBullet key={item}>{renderInlineCode(item)}</LegalBullet>
    ))}
  </LegalBullets>
);

const LegalItemBody = ({ text }: { text: string }) => (
  <LegalBody>
    {parseLegalText(text).map((block, index) => {
      if (block.kind === "paragraph") {
        return <LegalText key={index}>{renderInlineCode(block.text)}</LegalText>;
      }

      if (block.kind === "bullets") {
        return <Fragment key={index}>{renderBullets(block.items)}</Fragment>;
      }

      return (
        <LegalLetteredList key={index}>
          {block.items.map((item) => (
            <LegalLettered key={item.mark}>
              <LegalLetteredMark>{item.mark}</LegalLetteredMark>
              <LegalLetteredText>
                {renderInlineCode(item.text)}
                {item.bullets.length > 0 ? renderBullets(item.bullets) : null}
              </LegalLetteredText>
            </LegalLettered>
          ))}
        </LegalLetteredList>
      );
    })}
  </LegalBody>
);

const TITLE_ID = "legal-title";

const sectionAnchor = (id: number | string) => `section-${id}`;

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
          <LegalTitle id={TITLE_ID}>{title}</LegalTitle>
          <LegalOutline aria-labelledby={TITLE_ID}>
            {items.map((item) => (
              <LegalOutlineLink key={item.id} href={`#${sectionAnchor(item.id)}`}>
                {item.title}
              </LegalOutlineLink>
            ))}
          </LegalOutline>
          <LegalItemText>
            <LegalDescription>
              {linkEmailInDescription ? renderTextWithEmail(description) : description}
            </LegalDescription>
            <LegalItems>
              {items.map((item) => (
                <LegalItem key={item.id} id={sectionAnchor(item.id)}>
                  <LegalItemTitle>{item.title}</LegalItemTitle>
                  <LegalItemBody text={item.text} />
                </LegalItem>
              ))}
            </LegalItems>
            <LegalContactLine>{renderTextWithEmail(contactLine)}</LegalContactLine>
          </LegalItemText>
        </LegalContent>
      </LegalSection>
    </>
  );
}
