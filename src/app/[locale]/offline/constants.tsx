import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";
import { IMPRO_ROOM_REGISTRATION_FORM_VIEW_URL } from "@/constants/links";
import { SmallClock, SmallMap } from "@/svg";

import {
  ContentStack,
  DetailStrongText,
  DetailText,
  DetailValueText,
  IconCell,
  InfoGrid,
  InfoSection,
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

const buildScheduleAndLocationContent = (
  t: Translate,
  scheduleKeys: [string, string],
  {
    locationLabelKey = "cards.common.location",
    locationValueKey = "cards.common.locationValue",
    scheduleLabelKey = "cards.common.schedule",
  }: {
    locationLabelKey?: string;
    locationValueKey?: string;
    scheduleLabelKey?: string;
  } = {},
) => (
  <>
    <InfoSection>
      <InfoGrid>
        <IconCell>
          <SmallClock />
        </IconCell>
        <DetailStrongText>{t(scheduleLabelKey)}</DetailStrongText>

        <div />
        <DetailText>{t(scheduleKeys[0])}</DetailText>

        <div />
        <DetailText>{t(scheduleKeys[1])}</DetailText>
      </InfoGrid>
    </InfoSection>

    <InfoSection>
      <InfoGrid>
        <IconCell>
          <SmallMap />
        </IconCell>
        <DetailStrongText>{t(locationLabelKey)}</DetailStrongText>

        <div />
        <DetailText>{t(locationValueKey)}</DetailText>
      </InfoGrid>
    </InfoSection>
  </>
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
      <ContentStack $gap="26px">
        <ContentStack $gap="16px">
          <DetailText>
            {t("cards.impro.description")} {t("cards.impro.details")}
          </DetailText>
          <DetailStrongText>{t("cards.impro.note")}</DetailStrongText>
        </ContentStack>
        {buildScheduleAndLocationContent(
          t,
          ["cards.impro.schedule.1", "cards.impro.schedule.2"],
          {
            locationLabelKey: "cards.impro.location",
            locationValueKey: "cards.impro.locationValue",
            scheduleLabelKey: "cards.impro.scheduleTitle",
          },
        )}
      </ContentStack>
    ),
    bottomRowContent: buildPriceRow(t, "cards.impro.price", "cards.impro.priceSuffix"),
    buttonText: t("cards.common.button"),
    buttonHref: IMPRO_ROOM_REGISTRATION_FORM_VIEW_URL,
    buttonTarget: "_blank",
    buttonRel: "noopener noreferrer",
  },
];
