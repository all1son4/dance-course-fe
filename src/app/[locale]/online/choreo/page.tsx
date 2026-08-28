import { useTranslations } from "next-intl";

import HeroMedia from "@/app/[locale]/_shared/hero-media";
import StructuredData from "@/components/common/StructuredData";
import ClosedSalesNotice from "@/components/other/ClosedSalesNotice";
import Contacts from "@/components/other/Contacts";
import { HERO_MEDIA } from "@/constants/hero-media";
import { buildLocalizedPageMetadata } from "@/lib/page-metadata";
import { buildBreadcrumbStructuredData } from "@/lib/seo";

import { createRichText } from "../_shared/content";
import ProductHero from "../_shared/product-hero";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  DateBox,
  Description,
  DescriptionParagraph,
  InfoBoxGroup,
  SpecialWrapper,
} from "../_shared/section.styles";
import SuggestionGrid from "../_shared/suggestion-grid";
import { getChoreoSuggestions } from "./constants";
import {
  IconBox,
  ImageBox,
  IntroductionSection,
  MobileImagesBox,
  TextBox,
  Title,
} from "./page.styles";

export const generateMetadata = () =>
  buildLocalizedPageMetadata({ pageKey: "choreo", path: "/online/choreo" });

export default function ChoreoPage() {
  const t = useTranslations("ChoreoPage");
  const commonT = useTranslations("Common");
  const onlineSuggestions = getChoreoSuggestions((key) => t(key), createRichText(t));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online" },
          { name: t("hero.title"), path: "/online/choreo" },
        ])}
      />
      <ProductHero
        components={{ Section: IntroductionSection, TextBox }}
        media={
          <HeroMedia
            boxes={{ MobileImagesBox, ImageBox, IconBox }}
            photo={{
              asset: HERO_MEDIA.choreo,
              mobileSizes: "(max-width: 767px) 100vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px",
            }}
            icon={{
              asset: HERO_MEDIA.choreoTelegram,
              mobileSizes: "(max-width: 767px) 50vw, 0px",
              desktopSizes:
                "(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px",
            }}
          />
        }
      >
        <Title>{t("hero.title")}</Title>
        <Description>
          <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
          <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
        </Description>

        <InfoBoxGroup>
          <DateBox>
            <ClosedSalesNotice text={commonT("salesClosed")} />
          </DateBox>
        </InfoBoxGroup>
      </ProductHero>

      <SpecialWrapper>
        <SuggestionGrid
          components={{
            Section: AboutChoreoSection,
            Title: AboutChoreoTitle,
            Cards: AboutChoreoCards,
          }}
          title={t("about.title")}
          items={onlineSuggestions}
        />
        <Contacts />
      </SpecialWrapper>
    </>
  );

  /*
   * Preserved in full: the layout used while regular choreography sales were
   * open - hero with start and sales dates, the generic suggestion cards and the
   * choreography catalogue. Kept so it can be swapped back in without being
   * rebuilt; it needs `ChoreoCatalogueSection` back among the imports, plus a
   * rebuilt `choreographyProductsStructuredData` (its builder is gone).
   *
   * The catalogue itself already follows the admin sales switch: a breakdown
   * with sales off keeps its card and loses only the buy buttons, so restoring
   * this block cannot reopen a closed product. Because it reads that switch,
   * restoring it also means bringing `export const dynamic = "force-dynamic"`
   * back to this page - otherwise the answer is baked in at build time.
   */
  // <>
  //   <StructuredData data={choreographyProductsStructuredData} />
  //   <IntroductionSection>
  //     <TextBox>
  //       <Title>{t("hero.title")}</Title>

  //       <Description>
  //         <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
  //         <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
  //       </Description>

  //       <InfoBoxGroup>
  //         <DateBox>
  //           <From>{t("hero.startLabel")}</From>
  //           <Date>{t("hero.startValue")}</Date>
  //         </DateBox>

  //         <DateBox>
  //           <From>{t("hero.salesLabel")}</From>
  //           <Date>{t("hero.salesValue")}</Date>
  //         </DateBox>
  //       </InfoBoxGroup>

  //       <ButtonBox>
  //         <Button buttonText={t("hero.button")} href="#choreo-section" />
  //       </ButtonBox>
  //     </TextBox>

  //     <MobileImagesBox>
  //       <ImageBox id="mobile-only-image-box">
  //         <SvgAsset
  //           src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
  //           width={794}
  //           height={989}
  //           sizes="(max-width: 767px) 100vw, 0px"
  //           priority
  //           unoptimized
  //         />
  //       </ImageBox>

  //       <IconBox id="mobile-only-icon-box">
  //         <SvgAsset
  //           src="/svg/TelegramChoreo.webp"
  //           width={401}
  //           height={421}
  //           sizes="(max-width: 767px) 50vw, 0px"
  //         />
  //       </IconBox>
  //     </MobileImagesBox>

  //     <ImageBox id="desktop-only-image-box">
  //       <SvgAsset
  //         src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
  //         width={794}
  //         height={989}
  //         sizes="(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px"
  //         priority
  //         unoptimized
  //       />
  //     </ImageBox>

  //     <IconBox id="desktop-only-icon-box">
  //       <SvgAsset
  //         src="/svg/TelegramChoreo.webp"
  //         width={401}
  //         height={421}
  //         sizes="(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px"
  //       />
  //     </IconBox>
  //   </IntroductionSection>
  //   <SpecialWrapper>
  //     <AboutChoreoSection>
  //       <AboutChoreoTitle>{t("about.title")}</AboutChoreoTitle>
  //       <AboutChoreoCards>
  //         {onlineSuggestions.map(({ id, ...suggestion }) => (
  //           <IconTextCard key={id} {...suggestion} />
  //         ))}
  //       </AboutChoreoCards>
  //     </AboutChoreoSection>
  //     <ChoreoCatalogueSection />
  //     <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
  //   </SpecialWrapper>
  // </>
}
