import type { ReactNode } from "react";

import { buildCheckoutHref, SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import {
  OnlineCalendar,
  OnlineGroup,
  OnlineStructure,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

export type TOnlineSuggestion = {
  id: number;
  icon?: ReactNode;
  title?: string;
  text?: string;
};

export type TChoreoCard = {
  id: number;
  videoSrc?: string;
  postrSrc: string;
  title?: string;
  firstButtonOptions?: {
    href?: string;
    text?: string;
  };
  secondButtonOptions?: {
    href?: string;
    text?: string;
  };
};

type Translate = (key: string) => string;

export const getOnlineSuggestions = (t: Translate): TOnlineSuggestion[] => [
  {
    id: 1,
    icon: <OnlineVideo />,
    title: t("suggestions.1.title"),
    text: t("suggestions.1.text"),
  },
  {
    id: 2,
    icon: <OnlineStructure />,
    title: t("suggestions.2.title"),
    text: t("suggestions.2.text"),
  },
  {
    id: 3,
    icon: <OnlineCalendar />,
    title: t("suggestions.3.title"),
    text: t("suggestions.3.text"),
  },
  {
    id: 4,
    icon: <OnlineTelegram />,
    title: t("suggestions.4.title"),
    text: t("suggestions.4.text"),
  },
  {
    id: 5,
    icon: <OnlineGroup />,
    title: t("suggestions.5.title"),
    text: t("suggestions.5.text"),
  },
];

export const getChoreos = (locale: string, t: Translate): TChoreoCard[] => {
  const stillAlive = SELLABLE_PRODUCTS["choreo-still-alive"];
  const herLies = SELLABLE_PRODUCTS["choreo-her-lies"];

  return [
    {
      id: 1,
      videoSrc: "https://www.instagram.com/reel/DRAHnn4jWk9/?igsh=NjF3eDNia3hxbDZ2",
      postrSrc: "/images/still_alive_poster.webp",
      title: "Still Alive",
      firstButtonOptions: {
        href: buildCheckoutHref({
          locale,
          offerId: stillAlive.offers[0]?.id,
          productId: stillAlive.id,
        }),
        text: t("pricing.withoutMentor"),
      },
      secondButtonOptions: {
        href: buildCheckoutHref({
          locale,
          offerId: stillAlive.offers[1]?.id,
          productId: stillAlive.id,
        }),
        text: t("pricing.withMentor"),
      },
    },
    {
      id: 2,
      videoSrc: "https://www.instagram.com/reel/DKw36jmNp5D/?igsh=MWg4NDA0cWx6dnpnNQ==",
      postrSrc: "/images/her_lies_poster.webp",
      title: "Her Lies",
      firstButtonOptions: {
        href: buildCheckoutHref({
          locale,
          offerId: herLies.offers[0]?.id,
          productId: herLies.id,
        }),
        text: t("pricing.withoutMentor"),
      },
      secondButtonOptions: {
        href: buildCheckoutHref({
          locale,
          offerId: herLies.offers[1]?.id,
          productId: herLies.id,
        }),
        text: t("pricing.withMentor"),
      },
    },
  ];
};
