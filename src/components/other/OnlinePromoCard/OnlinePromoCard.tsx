import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import CourseCard from "@/components/cards/CourseCard";

import { CourseList, HighlightText, ProductLink } from "./OnlinePromoCard.styles";

type OnlinePromoCardProps = {
  icon: ReactNode;
  bgColor?: string;
};

/**
 * The "what is online" teaser card shown on the home and offline pages: same
 * bullets and the same "Details" link to /online on both, so the copy
 * lives in one namespace and the markup in one place. Each bullet links to
 * its product page - the only direct path from the home page to them.
 */
export default function OnlinePromoCard({ bgColor, icon }: OnlinePromoCardProps) {
  const t = useTranslations("OnlinePromoCard");
  const commonT = useTranslations("Common");

  return (
    <CourseCard
      analyticsId="online-promo"
      icon={icon}
      title={t("title")}
      subtitle={t("subtitle")}
      cardContent={
        <CourseList>
          <li>
            <ProductLink href="/online/first-touch">
              {t("items.1.prefix")}{" "}
              <HighlightText>{t("items.1.highlight")}</HighlightText>
            </ProductLink>
          </li>
          <li>
            <ProductLink href="/online/group">
              {t("items.2.prefix")}{" "}
              <HighlightText>{t("items.2.highlight")}</HighlightText>
            </ProductLink>
          </li>
          <li>
            <ProductLink href="/online/inspiration-hub">
              {t("items.hub.prefix")}{" "}
              <HighlightText>{t("items.hub.highlight")}</HighlightText>
            </ProductLink>
          </li>
          <li>
            <ProductLink href="/online/choreo">{t("items.3")}</ProductLink>
          </li>
          {/* <li>
            <HighlightText>{t("items.4")}</HighlightText>
          </li> */}
        </CourseList>
      }
      buttonText={commonT("details")}
      buttonHref="/online"
      bgColor={bgColor}
    />
  );
}
