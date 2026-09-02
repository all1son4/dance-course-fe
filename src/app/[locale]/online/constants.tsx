import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";

import {
  ContentStack,
  DetailText,
  DetailValueText,
} from "../_shared/interactive-card-content";

type Translate = (key: string) => string;
type InteractiveCourseCard = InteractiveCardProps & {
  id: string;
};

export const getOnlineCoursesArray = (
  t: Translate,
  commonT: Translate,
): InteractiveCourseCard[] => [
  {
    id: "birthday-drop",
    title: t("cards.birthdayDrop.title"),
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.birthdayDrop.description.1")}</DetailText>
        <DetailText>{t("cards.birthdayDrop.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.birthdayDrop.salesLabel")}</DetailText>
        <DetailValueText>{t("cards.birthdayDrop.salesValue")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: commonT("details"),
    buttonHref: "/online/birthday-drop",
    buttonPrefetch: false,
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
    buttonText: commonT("details"),
    buttonHref: "/online/group",
    buttonPrefetch: false,
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
        <DetailValueText>{commonT("salesClosed")}</DetailValueText>
      </ContentStack>
    ),
    buttonText: commonT("details"),
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
    buttonText: commonT("details"),
    buttonHref: "/online/first-touch",
  },
];
