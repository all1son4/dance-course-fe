import { useTranslations } from "next-intl";

import { SkipLinkAnchor } from "./SkipLink.styles";

export const MAIN_CONTENT_ID = "main-content";

/**
 * First Tab stop on every page: lets keyboard and screen-reader users jump
 * past the header straight to the content. Invisible until it has focus.
 */
export default function SkipLink() {
  const t = useTranslations("Common");

  return (
    <SkipLinkAnchor href={`#${MAIN_CONTENT_ID}`} data-print-hidden="">
      {t("skipToContent")}
    </SkipLinkAnchor>
  );
}
