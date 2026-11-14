import type { InteractiveCardProps } from "@/components/cards/InteractiveCard";
import {
  buildCheckoutHref,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
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

export const getOnlineCoursesArray = (
  t: Translate,
  commonT: Translate,
  choreoSaleState: ProductSaleState = "closed",
  hubSaleState: ProductSaleState = "closed",
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
    id: "choreo",
    title: t("cards.choreo.title"),
    headerPhoto: "/images/photos/card_choreo.webp",
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.choreo.description.1")}</DetailText>
        <DetailText>{t("cards.choreo.description.2")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
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
    topRowContent: (
      <ContentStack $gap="16px">
        <DetailText>{t("cards.inspirationHub.description.1")}</DetailText>
      </ContentStack>
    ),
    bottomRowContent: (
      <ContentStack>
        <DetailText>{t("cards.inspirationHub.accessLabel")}</DetailText>
        <DetailFactText>
          {hubSaleState === "open"
            ? t("cards.inspirationHub.accessValue")
            : commonT("salesUnavailable")}
        </DetailFactText>
      </ContentStack>
    ),
    // While sales are open the card goes straight to checkout; otherwise to the page.
    ...(hubSaleState === "open"
      ? {
          buttonText: t("cards.inspirationHub.buyButton"),
          buttonHref: buildCheckoutHref({
            offerId: INSPIRATION_HUB_ACCESS_OFFER_ID,
            productId: SELLABLE_PRODUCTS["inspiration-hub"].id,
          }),
          buttonRel: "nofollow",
        }
      : { buttonText: commonT("details"), buttonHref: "/online/inspiration-hub" }),
    buttonPrefetch: false,
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
