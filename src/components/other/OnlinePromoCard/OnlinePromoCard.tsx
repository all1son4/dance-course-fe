import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import CourseCard from "@/components/cards/CourseCard";

import { CourseList, HighlightText } from "./OnlinePromoCard.styles";

type OnlinePromoCardProps = {
  icon: ReactNode;
  bgColor?: string;
};

/**
 * The "what is online" teaser card shown on the home and offline pages: same
 * four bullets and the same "Details" link to /online on both, so the copy
 * lives in one namespace and the markup in one place.
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
            {t("items.1.prefix")}{" "}
            <HighlightText>&quot;{t("items.1.highlight")}&quot;</HighlightText>
          </li>
          <li>
            {t("items.2.prefix")} <HighlightText>{t("items.2.highlight")}</HighlightText>
          </li>
          <li>{t("items.3")}</li>
          <li>
            <HighlightText>{t("items.4")}</HighlightText>
          </li>
        </CourseList>
      }
      buttonText={commonT("details")}
      buttonHref="/online"
      bgColor={bgColor}
    />
  );
}
