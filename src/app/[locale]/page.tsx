import Image from "next/image";
import { useTranslations } from "next-intl";
import { styled } from "styled-components";

import { Button, ContactCard, Contacts, CourseCard, FAQ } from "@/components";
import SvgAsset from "@/components/common/SvgAsset";
import { glass } from "@/styles/mixins/glass";
import { Insta, Logo, Quote } from "@/svg";

const IntroduceSection = styled.section`
  position: relative;
  width: 100%;
  min-height: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;

  @media (max-width: 1440px) {
    padding: 0 20px;
  }

  @media (max-width: 1240px) {
    min-height: 750px;
    padding: 0 20px 0 30px;
  }

  @media (max-width: 920px) {
    padding: 10px 20px 0;
    min-height: 600px;
  }

  @media (max-width: 767px) {
    min-height: unset;
    flex-direction: column-reverse;
    padding: 8px 20px 60px;
  }
`;

const AbsolutePageImage = styled.div`
  position: absolute;
  top: 0;
  left: 34%;
  z-index: 20;

  @media (max-width: 1440px) {
    width: 52%;
  }

  @media (max-width: 1240px) {
    display: none;
  }
`;

const AbsolutePageLogo = styled.div`
  position: relative;
  z-index: 25;

  & .hero-mobile-bg {
    display: none;
  }

  @media (max-width: 1240px) {
    display: flex;
    flex-direction: column-reverse;
    & .hero-mobile-bg {
      position: relative;
      display: flex;
      height: 750px;
      max-width: 550px;
    }

    & .hero-brand-logo {
      display: none;
    }
  }

  @media (max-width: 1110px) {
    & .hero-mobile-bg {
      position: relative;
      max-width: 480px;
    }
  }

  @media (max-width: 920px) {
    & .hero-mobile-bg {
      height: 600px;
      max-width: 420px;
    }
  }

  @media (max-width: 767px) {
    & .hero-mobile-bg {
      height: auto;
      max-width: 65%;
      margin: 0 auto;
    }
  }

  @media (max-width: 680px) {
    & .hero-mobile-bg {
      max-width: 80%;
    }
  }

  @media (max-width: 450px) {
    & .hero-mobile-bg {
      max-width: 100%;
    }
  }
`;

const MainTextBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  z-index: 25;
  max-width: 450px;

  @media (max-width: 920px) {
    max-width: 300px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

const MainTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 90px;
  line-height: 130%;
  letter-spacing: 0;
  margin: 0 0 20px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 920px) {
    font-size: 50px;
  }

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

const DescriptionBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  margin: 0 0 40px 0;
  box-sizing: border-box;

  @media (max-width: 920px) {
    margin: 0 0 20px 0;
  }
`;

const DescriptionTitle = styled.p`
  font-weight: 600;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
`;

const DescriptionText = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InteractiveHint = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const ButtonsBox = styled.div`
  display: flex;
  gap: 20px;

  @media (max-width: 450px) {
    flex-direction: column;
    gap: 15px;
  }
`;

const AboutMeSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px;
  gap: 20px;

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    flex-direction: column;
    border-radius: 40px;
    gap: 40px;
  }
`;

const AboutMeTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 505px;
  align-items: flex-start;

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1110px) {
    max-width: 340px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
  }
`;

const AboutMeTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: #000000;

  @media (max-width: 880px) {
    font-size: 40px;
    margin: 0 0 30px 0;
  }
`;

const AboutMeParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  margin: 40px 0 30px 0;

  @media (max-width: 880px) {
    margin: 30px 0;
  }
`;

const AboutMeParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0 0 14px 0;
  color: rgba(0, 0, 0, 1);

  &:last-of-type {
    margin: 0;
  }
`;

const AboutMeList = styled.ul`
  list-style: disc;
  padding-left: 22px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: #000000;

  & > li {
    & a {
      text-underline-offset: 2px;
      text-decoration: underline;
      transition: color 0.2s ease;

      @media (hover: hover) and (pointer: fine) {
        &:hover {
          color: rgba(124, 0, 2, 1);
        }
      }
    }
    margin: 0;
  }
`;

const AboutMeImageBox = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  max-width: 560px;

  @media (max-width: 880px) {
    margin: 0 auto;
  }
`;

const StyledImage = styled(Image)`
  width: 100%;
  height: auto;
  border-radius: 100px;
  object-fit: cover;

  @media (max-width: 767px) {
    border-radius: 40px;
  }
`;

const ImageDescriptionBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const IconPositionWrap = styled.div`
  position: absolute;
  z-index: 10;
  left: -36px;
  top: -120px;

  @media (max-width: 1240px) {
    left: 60px;
    top: -135px;
  }

  @media (max-width: 1240px) {
    left: 30px;
    top: -220px;

    & :is(svg, img) {
      width: 50px;
      height: auto;
    }
  }

  @media (max-width: 450px) {
    top: -180px;
  }
`;

const ImageDescriptionCard = styled.div`
  padding: 60px;
  max-width: 590px;
  width: 100%;
  margin: -86px 0 0 -98px;

  ${glass({
    radius: "100px",
    bgParam: "rgba(228, 228, 228, 0.4)",
  })}

  @media (max-width: 1240px) {
    margin: -106px 0 0 0;
  }

  @media (max-width: 767px) {
    padding: 30px;
    margin: -200px 0 0 0;
    border-radius: 40px !important;
  }

  @media (max-width: 450px) {
    margin: -160px 0 0 0;
    & p {
      font-size: 15px;
    }
  }
`;

const CourseSection = styled.section`
  padding: 100px 50px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 80px;

  @media (max-width: 1240px) {
    padding: 100px 0;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 60px 20px;
    gap: 30px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    gap: 30px;
  }
`;

const CourseTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

const CourseOptionsBox = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;

  @media (max-width: 1100px) {
    & .courseCardContainer {
      padding: 40px;
      min-width: unset;
      max-width: 100%;
    }
    gap: 20px;

    & > .courseCardContainer:first-of-type .courseCardIconBox {
      top: -30px;
      right: 30px;
      & :is(svg, img) {
        width: 76px;
        height: 122px;
      }
    }

    & > .courseCardContainer:last-of-type .courseCardIconBox {
      top: -24px;
      right: 3px;
      & :is(svg, img) {
        width: 94px;
        height: 104px;
      }
    }
  }

  @media (max-width: 880px) {
    & .courseCardContainer {
      border-radius: 40px;
    }
  }

  @media (max-width: 767px) {
    & .courseCardContainer {
      padding: 30px;
      gap: 30px;
    }

    .courseCardTitle {
      font-size: 28px;
    }
    & .courseCardButton {
      max-width: 100%;
    }
  }

  @media (max-width: 680px) {
    flex-direction: column;
    gap: 40px;
  }
`;

const CourseList = styled.ul`
  list-style: numeric;
  padding: 0 0 0 16px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: #000000;

  & li {
    margin: 0;
  }
`;

const FAQSection = styled.section`
  padding: 50px 50px 100px;
  display: flex;

  @media (max-width: 1240px) {
    padding: 50px 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 50px 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 60px;
  }

  @media (max-width: 680px) {
    padding: 40px 20px;
  }
`;

const ContactSection = styled.section`
  padding: 0 50px 100px;

  @media (max-width: 1240px) {
    padding: 0 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 0 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 0 20px 60px;
  }
`;

export default function Home() {
  const t = useTranslations("HomePage");
  const commonT = useTranslations("Common");

  return (
    <>
      <IntroduceSection>
        <AbsolutePageImage>
          <SvgAsset
            src="/svg/MainPageBackgroundPhoto.svg"
            width={775}
            height={900}
            priority
          />
        </AbsolutePageImage>
        <MainTextBox>
          <MainTitle>{t("hero.title")}</MainTitle>
          <DescriptionBox>
            <DescriptionTitle>{t("hero.subtitle")}</DescriptionTitle>
            <DescriptionText>{t("hero.description")}</DescriptionText>
          </DescriptionBox>
          <InteractiveBox>
            <InteractiveHint>{t("hero.hint")}</InteractiveHint>
            <ButtonsBox>
              <Button buttonText={t("hero.buttons.online")} href="/online" />
              <Button buttonText={t("hero.buttons.offline")} href="/offline" />
            </ButtonsBox>
          </InteractiveBox>
        </MainTextBox>
        <AbsolutePageLogo>
          <SvgAsset
            src="/svg/MainPageBackgroundPhoto.svg"
            width={775}
            height={900}
            className="hero-mobile-bg"
            priority
          />
          <div className="hero-brand-logo">
            <Logo width={350} height={77} />
          </div>
        </AbsolutePageLogo>
      </IntroduceSection>
      <AboutMeSection>
        <AboutMeTextBox>
          <AboutMeTitle>{t("about.title")}</AboutMeTitle>
          <ContactCard
            icon={<Insta />}
            title={t("about.instagram")}
            text="anna.strok_dance"
            link="https://www.instagram.com/anna.strok_dance"
          />
          <AboutMeParagraphs>
            <AboutMeParagraph>{t("about.bio.1")}</AboutMeParagraph>
            <AboutMeParagraph>{t("about.bio.2")}</AboutMeParagraph>
          </AboutMeParagraphs>

          <AboutMeList>
            <li>
              {t("about.achievements.stage18Solo.prefix")}{" "}
              <a
                href="https://www.instagram.com/stage__18?igsh=eDF3YTU1a3Z1d3pt"
                target="_blank"
              >
                @stage_18
              </a>{" "}
              {t("about.achievements.stage18Solo.suffix")}
            </li>
            <li>
              {t("about.achievements.stage18Team.prefix")}{" "}
              <a
                href="https://www.instagram.com/stage__18?igsh=eDF3YTU1a3Z1d3pt"
                target="_blank"
              >
                @stage_18
              </a>{" "}
              {t("about.achievements.stage18Team.suffix")}
            </li>
            <li>
              {t("about.achievements.wod.prefix")}{" "}
              <a
                href="https://www.instagram.com/worldofdancepoland?igsh=MWtsMWo5cmxyYWd3dQ=="
                target="_blank"
              >
                @worldofdancepoland
              </a>{" "}
              {t("about.achievements.wod.suffix")}
            </li>
            <li>
              {t("about.achievements.dib.prefix")}{" "}
              <a
                href="https://www.instagram.com/dib.gala?igsh=MWZ3eXgwYnFrMWU2dA=="
                target="_blank"
              >
                @dib.gala
              </a>
            </li>
          </AboutMeList>
        </AboutMeTextBox>
        <AboutMeImageBox>
          <StyledImage
            src={"/images/main_page_second.png"}
            alt={t("about.imageAlt")}
            width={560}
            height={635}
            sizes="(max-width: 880px) 100vw, 560px"
          />
          <ImageDescriptionBox>
            <IconPositionWrap>
              <Quote />
            </IconPositionWrap>
            <ImageDescriptionCard>
              <AboutMeParagraph>{t("about.quote.1")}</AboutMeParagraph>
              <AboutMeParagraph>{t("about.quote.2")}</AboutMeParagraph>
            </ImageDescriptionCard>
          </ImageDescriptionBox>
        </AboutMeImageBox>
      </AboutMeSection>
      <CourseSection>
        <CourseTitle>{t("courses.title")}</CourseTitle>
        <CourseOptionsBox>
          <CourseCard
            icon={<SvgAsset src="/svg/Map.svg" width={132} height={210} />}
            title={t("courses.offline.title")}
            subtitle={t("courses.offline.subtitle")}
            cardContent={
              <CourseList>
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.1.highlight")}
                  </span>{" "}
                  - {t("courses.offline.items.1.text")}
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.2.highlight")}
                  </span>{" "}
                  - {t("courses.offline.items.2.text")}
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>
                    {t("courses.offline.items.3.highlight")}
                  </span>{" "}
                  - {t("courses.offline.items.3.text")}
                </li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/offline"
          />
          <CourseCard
            icon={<SvgAsset src="/svg/TelegramGlass.svg" width={169} height={190} />}
            title={t("courses.online.title")}
            subtitle={t("courses.online.subtitle")}
            cardContent={
              <CourseList>
                <li>
                  {t("courses.online.items.1.prefix")}{" "}
                  <span style={{ fontWeight: 600 }}>
                    &quot;{t("courses.online.items.1.highlight")}&quot;
                  </span>
                </li>
                <li>{t("courses.online.items.2")}</li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/online"
          />
        </CourseOptionsBox>
      </CourseSection>
      <FAQSection>
        <FAQ />
      </FAQSection>
      <ContactSection>
        <Contacts />
      </ContactSection>
    </>
  );
}
