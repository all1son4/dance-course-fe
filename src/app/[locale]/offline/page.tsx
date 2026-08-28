import { useTranslations } from "next-intl";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import InteractiveCard from "@/components/cards/InteractiveCard";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import Contacts from "@/components/other/Contacts";
import OnlinePromoCard from "@/components/other/OnlinePromoCard";
import { HERO_MEDIA } from "@/constants/hero-media";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { buildBreadcrumbStructuredData } from "@/lib/seo";

import ProductHero from "../online/_shared/product-hero";
import { getOfflineCoursesArray } from "./constants";
import {
  CardBlock,
  CoursesSection,
  Description,
  IconBox,
  ImageBox,
  IntroductionSection,
  Location,
  MobileImagesBox,
  Paragraph,
  Paragraphs,
  PromoteOnlineSection,
  PromoteTitle,
  TextBlock,
  TextBox,
  Title,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "offline", path: "/offline" });

export default function Offline() {
  const t = useTranslations("OfflinePage");
  const offlineCoursesArray = getOfflineCoursesArray((key) => t(key));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: t("hero.title"), path: "/offline" },
        ])}
      />
      <ProductHero
        components={{ Section: IntroductionSection, TextBox }}
        media={
          <HeroMedia
            boxes={{ MobileImagesBox, ImageBox, IconBox }}
            photo={{
              asset: HERO_MEDIA.offline,
              mobileSizes: "(max-width: 767px) 100vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 400px, (max-width: 960px) 460px, (max-width: 1240px) 500px, 558px",
            }}
            icon={{
              asset: HERO_MEDIA.warsawMap,
              mobileSizes: "(max-width: 550px) 58vw, (max-width: 767px) 95vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 250px, (max-width: 1100px) 310px, 379px",
            }}
          />
        }
      >
        <Title>{t("hero.title")}</Title>
        <Location>{t("hero.location")}</Location>
        <Description>{t("hero.description")}</Description>
      </ProductHero>
      <CoursesSection>
        {offlineCoursesArray.map(({ id, ...course }) => (
          <InteractiveCard key={id} {...course} />
        ))}
      </CoursesSection>
      <PromoteOnlineSection>
        <TextBlock>
          <PromoteTitle>{t("promo.title")}</PromoteTitle>
          <Paragraphs>
            <Paragraph>{t("promo.description.1")}</Paragraph>
            <Paragraph>{t("promo.description.2")}</Paragraph>
          </Paragraphs>
        </TextBlock>
        <CardBlock>
          <OnlinePromoCard
            icon={<SvgAsset src="/svg/TelegramGlass.webp" width={115} height={130} />}
            bgColor="rgba(200, 204, 210, 0.4)"
          />
        </CardBlock>
      </PromoteOnlineSection>
      <Contacts layout="slabTight" />
    </>
  );
}
