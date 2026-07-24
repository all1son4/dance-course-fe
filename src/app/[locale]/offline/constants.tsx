import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";
import { INSTAGRAM_PROFILE_URL } from "@/constants/links";

import {
  ContentStack,
  DetailStrongText,
  DetailText,
  DetailValueText,
  PriceFrequency,
  PriceRow,
} from "../_shared/interactive-card-content";

type Translate = (key: string) => string;
type InteractiveCourseCard = InteractiveCardProps & {
  id: string;
};

const buildPriceRow = (t: Translate, priceKey: string, suffixKey: string) => (
  <PriceRow>
    <DetailValueText>{t(priceKey)}</DetailValueText>
    <PriceFrequency>{t(suffixKey)}</PriceFrequency>
  </PriceRow>
);

export const getOfflineCoursesArray = (t: Translate): InteractiveCourseCard[] => [
  // {
  //   id: "from-zero",
  //   title: t("cards.fromZero.title"),
  //   topRowContent: (
  //     <ContentStack $gap="26px">
  //       <DetailText>{t("cards.fromZero.description")}</DetailText>
  //       {buildScheduleAndLocationContent(t, [
  //         "cards.fromZero.schedule.1",
  //         "cards.fromZero.schedule.2",
  //       ])}
  //     </ContentStack>
  //   ),
  //   bottomRowContent: buildPriceRow(
  //     t,
  //     "cards.fromZero.price",
  //     "cards.fromZero.priceSuffix",
  //   ),
  //   buttonText: t("cards.common.button"),
  //   buttonHref: TRIAL_REGISTRATION_FORM_VIEW_URL,
  //   buttonTarget: "_blank",
  //   buttonRel: "noopener noreferrer",
  // },
  // {
  //   id: "advanced",
  //   title: t("cards.advanced.title"),
  //   topRowContent: (
  //     <ContentStack $gap="26px">
  //       <DetailText>{t("cards.advanced.description")}</DetailText>
  //       {buildScheduleAndLocationContent(t, [
  //         "cards.advanced.schedule.1",
  //         "cards.advanced.schedule.2",
  //       ])}
  //     </ContentStack>
  //   ),
  //   bottomRowContent: buildPriceRow(
  //     t,
  //     "cards.advanced.price",
  //     "cards.advanced.priceSuffix",
  //   ),
  //   buttonText: t("cards.common.button"),
  //   buttonHref: TRIAL_REGISTRATION_FORM_VIEW_URL,
  //   buttonTarget: "_blank",
  //   buttonRel: "noopener noreferrer",
  // },
  {
    id: "impro",
    title: t("cards.impro.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.impro.description")}</DetailText>
        <DetailStrongText>{t("cards.impro.note")}</DetailStrongText>
        <DetailText>{t("cards.impro.details")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: buildPriceRow(t, "cards.impro.price", "cards.impro.priceSuffix"),
    buttonText: t("cards.common.button"),
    buttonHref: INSTAGRAM_PROFILE_URL,
    buttonTarget: "_blank",
    buttonRel: "noopener noreferrer",
  },
];
