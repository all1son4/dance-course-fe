import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Contacts, TextContentCard } from "@/components";
import StructuredData from "@/components/common/StructuredData";
import SvgAsset from "@/components/common/SvgAsset";
import {
  buildBreadcrumbStructuredData,
  buildPageMetadata,
  seoTargetLocale,
} from "@/lib/seo";

import { createRichText } from "../_shared/content";
import {
  AboutChoreoCards,
  AboutChoreoSection,
  AboutChoreoTitle,
  SpecialWrapper,
} from "../_shared/section.styles";
import { getOnlineSuggestions } from "./constants";
import {
  ClosedIconBox,
  ClosedSalesCard,
  DateBox,
  Description,
  DescriptionParagraph,
  IconBox,
  ImageBox,
  InfoBoxGroup,
  IntroductionSection,
  MobileImagesBox,
  TextBox,
  Title,
} from "./page.styles";

export async function generateMetadata(): Promise<Metadata> {
  const metadataT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata",
  });
  const pageT = await getTranslations({
    locale: seoTargetLocale,
    namespace: "Metadata.pages.choreo",
  });

  return buildPageMetadata({
    locale: seoTargetLocale,
    path: "/online/choreo",
    title: pageT("title"),
    description: pageT("description"),
    siteName: metadataT("siteName"),
    ogImageAlt: pageT("ogImageAlt"),
    keywords: pageT("keywords")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

export default function ChoreoPage() {
  const t = useTranslations("ChoreoPage");
  const onlineSuggestions = getOnlineSuggestions((key) => t(key), createRichText(t));

  return (
    <>
      <StructuredData
        data={buildBreadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online" },
          { name: t("hero.title"), path: "/online/choreo" },
        ])}
      />
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Description>
            <DescriptionParagraph>{t("hero.description.1")}</DescriptionParagraph>
            <DescriptionParagraph>{t("hero.description.2")}</DescriptionParagraph>
          </Description>

          <InfoBoxGroup>
            <DateBox>
              <ClosedSalesCard>
                <ClosedIconBox>
                  <SvgAsset
                    src="/svg/Exclamation.webp"
                    width={57}
                    height={60}
                    sizes="(max-width: 767px) 34px, 57px"
                    unoptimized
                  />
                </ClosedIconBox>
                <p>{t("hero.closedValue")}</p>
              </ClosedSalesCard>
            </DateBox>
          </InfoBoxGroup>
        </TextBox>

        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
              width={794}
              height={989}
              sizes="(max-width: 767px) 100vw, 0px"
              priority
              unoptimized
            />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/TelegramChoreo.webp"
              width={401}
              height={421}
              sizes="(max-width: 767px) 50vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>

        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OnlineChoreoPageBackgroundPhoto.webp"
            width={794}
            height={989}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 490px, (max-width: 1140px) 540px, (max-width: 1240px) 640px, 794px"
            priority
            unoptimized
          />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/TelegramChoreo.webp"
            width={401}
            height={421}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 240px, (max-width: 1140px) 260px, (max-width: 1240px) 320px, 401px"
          />
        </IconBox>
      </IntroductionSection>

      <SpecialWrapper>
        <AboutChoreoSection>
          <AboutChoreoTitle>{t("about.title")}</AboutChoreoTitle>
          <AboutChoreoCards>
            {onlineSuggestions.map(({ id, ...suggestion }) => (
              <TextContentCard key={id} {...suggestion} />
            ))}
          </AboutChoreoCards>
        </AboutChoreoSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
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
  //           <TextContentCard key={id} {...suggestion} />
  //         ))}
  //       </AboutChoreoCards>
  //     </AboutChoreoSection>
  //     <ChoreoCatalogueSection />
  //     <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
  //   </SpecialWrapper>
  // </>
}
