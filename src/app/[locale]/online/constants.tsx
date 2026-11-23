import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";
import {
  CampaignPlate,
  CampaignPlateLabel,
  CampaignPlateValue,
} from "@/components/other/BlackFriday";
import type { ProductSaleState } from "@/lib/sales-availability";

import {
  ContentStack,
  DetailFactText,
  DetailText,
} from "../_shared/interactive-card-content";

type Translate = (key: string) => string;
type InteractiveCourseCard = InteractiveCardProps & {
  id: string;
};

/** Black Friday copy; present only while the campaign runs. */
export type OnlineBlackFridayCopy = {
  choreoLabel: string;
  choreoPlateLabel: string;
  choreoPrice: string;
  choreoRegularPrice?: string;
  hubLabel: string;
  hubPlateLabel: string;
  hubPrice: string;
};

/**
 * While the campaign runs the card's key fact is the offer itself: the same dark
 * price plate as on the tutorial cards.
 */
const CampaignFact = ({
  label,
  price,
  regularPrice,
}: {
  label: string;
  price: string;
  regularPrice?: string;
}) => (
  <CampaignPlate>
    <CampaignPlateLabel>{label}</CampaignPlateLabel>
    <CampaignPlateValue>
      {price}
      {regularPrice ? <s>{regularPrice}</s> : null}
    </CampaignPlateValue>
  </CampaignPlate>
);

export const getOnlineCoursesArray = (
  t: Translate,
  commonT: Translate,
  choreoSaleState: ProductSaleState = "closed",
  hubSaleState: ProductSaleState = "closed",
  blackFriday: OnlineBlackFridayCopy | null = null,
): InteractiveCourseCard[] => [
  // The Birthday Drop is retired (see BIRTHDAY_CAMPAIGN_ENABLED); its page
  // answers 404, so the card stays out until the campaign returns.
  // {
  //   id: "birthday-drop",
  //   title: t("cards.birthdayDrop.title"),
  //   topRowContent: (
  //     <ContentStack $gap="16px">
  //       <DetailText>{t("cards.birthdayDrop.description.1")}</DetailText>
  //       <DetailText>{t("cards.birthdayDrop.description.2")}</DetailText>
  //     </ContentStack>
  //   ),
  //   bottomRowContent: (
  //     <ContentStack>
  //       <DetailText>{t("cards.birthdayDrop.salesLabel")}</DetailText>
  //       <DetailValueText>{t("cards.birthdayDrop.salesValue")}</DetailValueText>
  //     </ContentStack>
  //   ),
  //   buttonText: commonT("details"),
  //   buttonHref: "/online/birthday-drop",
  //   buttonPrefetch: false,
  // },
  {
    id: "online-group",
    title: t("cards.onlineGroup.title"),
    headerPhoto: "/images/photos/card_online_group.webp",
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.onlineGroup.description.1")}</DetailText>
        <DetailText>{t("cards.onlineGroup.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.onlineGroup.startLabel")}</DetailText>
        <DetailFactText>{t("cards.onlineGroup.startValue")}</DetailFactText>
      </ContentStack>
    ),
    buttonText: commonT("details"),
    buttonHref: "/online/group",
    buttonPrefetch: false,
  },
  {
    id: "inspiration-hub",
    title: t("cards.inspirationHub.title"),
    headerPhoto: "/images/photos/card_inspiration_hub.webp",
    occasion:
      blackFriday && hubSaleState === "open"
        ? { theme: "black-friday", label: blackFriday.hubLabel }
        : undefined,
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.inspirationHub.description.1")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent:
      blackFriday && hubSaleState === "open" ? (
        <CampaignFact label={blackFriday.hubPlateLabel} price={blackFriday.hubPrice} />
      ) : (
        <ContentStack>
          <DetailText>{t("cards.inspirationHub.accessLabel")}</DetailText>
          <DetailFactText>
            {hubSaleState === "open"
              ? t("cards.inspirationHub.accessValue")
              : commonT("salesUnavailable")}
          </DetailFactText>
        </ContentStack>
      ),
    // Like every card here, it leads to the course page, where the buy button is.
    buttonText: commonT("details"),
    buttonHref: "/online/inspiration-hub",
    buttonPrefetch: false,
  },
  {
    id: "choreo",
    title: t("cards.choreo.title"),
    headerPhoto: "/images/photos/card_choreo.webp",
    occasion:
      blackFriday && choreoSaleState === "open"
        ? { theme: "black-friday", label: blackFriday.choreoLabel }
        : undefined,
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.choreo.description.1")}</DetailText>
        <DetailText>{t("cards.choreo.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent:
      blackFriday && choreoSaleState === "open" ? (
        <CampaignFact
          label={blackFriday.choreoPlateLabel}
          price={blackFriday.choreoPrice}
          regularPrice={blackFriday.choreoRegularPrice}
        />
      ) : (
        <ContentStack>
          <DetailText>
            {t(
              choreoSaleState === "open"
                ? "cards.choreo.startLabel"
                : "cards.choreo.salesLabel",
            )}
          </DetailText>
          <DetailFactText>
            {choreoSaleState === "open"
              ? t("cards.choreo.startValue")
              : commonT("salesUnavailable")}
          </DetailFactText>
        </ContentStack>
      ),
    buttonText: commonT("details"),
    buttonHref: "/online/choreo",
  },
  {
    id: "first-touch",
    title: t("cards.firstTouch.title"),
    headerPhoto: "/images/photos/card_first_touch.webp",
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
        <DetailFactText>{t("cards.firstTouch.startValue")}</DetailFactText>
      </ContentStack>
    ),
    buttonText: commonT("details"),
    buttonHref: "/online/first-touch",
  },
];
