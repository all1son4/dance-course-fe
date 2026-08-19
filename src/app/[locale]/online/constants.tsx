import type { ReactNode } from "react";

import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";

import {
  ContentStack,
  DetailText,
  DetailValueText,
} from "../_shared/interactive-card-content";

type Translate = (key: string) => string;
type RichTranslate = (key: string) => ReactNode;
type InteractiveCourseCard = InteractiveCardProps & {
  id: string;
};

export const getOnlineCoursesArray = (
  t: Translate,
  tRich: RichTranslate,
): InteractiveCourseCard[] => [
  {
    id: "birthday-drop",
    title: t("cards.birthdayDrop.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.birthdayDrop.description.1")}</DetailText>
        <DetailText>{t("cards.birthdayDrop.description.2")}</DetailText>
        {/* Carries <strong> markup, so it is resolved through the rich translator. */}
        <DetailText>{tRich("cards.birthdayDrop.description.3")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.birthdayDrop.salesLabel")}</DetailText>
        <DetailValueText>{t("cards.birthdayDrop.salesValue")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: t("cards.birthdayDrop.button"),
    buttonHref: "/online/birthday-drop",
  },
  {
    id: "online-group",
    title: t("cards.onlineGroup.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.onlineGroup.description.1")}</DetailText>
        <DetailText>{t("cards.onlineGroup.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.onlineGroup.startLabel")}</DetailText>
        <DetailValueText>{t("cards.onlineGroup.startValue")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: t("cards.onlineGroup.button"),
    buttonHref: "/online/group",
  },
  {
    id: "choreo",
    title: t("cards.choreo.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.choreo.description.1")}</DetailText>
        <DetailText>{t("cards.choreo.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.choreo.salesLabel")}</DetailText>
        <DetailValueText>{t("cards.choreo.salesValue")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: t("cards.choreo.button"),
    buttonHref: "/online/choreo",
  },
  {
    id: "first-touch",
    title: t("cards.firstTouch.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.firstTouch.description.1")}</DetailText>
        <DetailText>{t("cards.firstTouch.description.2")}</DetailText>
        <DetailText>{t("cards.firstTouch.description.3")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.firstTouch.startLabel")}</DetailText>
        <DetailValueText>{t("cards.firstTouch.startValue")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: t("cards.firstTouch.button"),
    buttonHref: "/online/first-touch",
  },
];
