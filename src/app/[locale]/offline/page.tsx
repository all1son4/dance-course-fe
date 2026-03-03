import { useTranslations } from "next-intl";
import { styled } from "styled-components";

import { Contacts, CourseCard, InteractiveCard } from "@/components";
import SvgAsset from "@/components/common/SvgAsset";

import { getOfflineCoursesArray } from "./constants";

const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 760px;
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

  @media (max-width: 1240px) {
    padding: 0 20px;
  }

  @media (max-width: 1100px) {
    min-height: 680px;
  }

  @media (max-width: 880px) {
    min-height: 640px;
  }

  @media (max-width: 767px) {
    min-height: unset;
    flex-direction: column;
    padding: 100px 20px 0;

    & #desktop-only-image-box,
    & #desktop-only-icon-box {
      display: none;
    }
  }
`;

const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 450px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  & p:last-of-type {
    font-weight: 300;
    font-style: normal;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    color: rgba(72, 72, 72, 1);
  }

  @media (max-width: 1024px) {
    padding: 0;
    max-width: 420px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

const MobileImagesBox = styled.div`
  display: none;
  position: relative;

  @media (max-width: 767px) {
    display: flex;
    width: 100%;

    & #mobile-only-image-box {
      position: relative;
      display: flex;
      width: 100%;
      justify-content: center;
      top: unset;
      right: unset;
      bottom: unset;
      margin: 10px 0 0 0;
      & :is(svg, img) {
        margin: 0 0 0 -40px;
        width: 100%;
        height: auto;
      }
    }

    & #mobile-only-icon-box {
      display: flex;
      justify-content: center;
      align-items: center;
      top: unset;
      right: unset;
      bottom: unset;
      width: 100%;
      height: 100%;

      & :is(svg, img) {
        top: unset;
        margin: 0 -50% 0 0;
        width: 95%;
        height: auto;
      }
    }
  }

  @media (max-width: 550px) {

  & #mobile-only-image-box {
    margin: 0;
  }
    & #mobile-only-icon-box {
    justify-content: flex-end;
      & :is(svg, img) {
        margin: 0;
        width: 58%;
      }
    }
  }
  }
`;

const Title = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

const Location = styled.p`
  margin: 0 0 40px 0;

  @media (max-width: 767px) {
    margin: 0 0 30px 0;
  }
`;

const Description = styled.p`
  margin: 0;
`;

const ImageBox = styled.div`
  position: absolute;
  top: 88px;
  right: 14%;
  z-index: 10;

  @media (max-width: 1240px) {
    & :is(svg, img) {
      right: 4%;
      max-width: 500px;
    }
  }

  @media (max-width: 1100px) {
    top: 48px;
    & :is(svg, img) {
      right: 0;
      max-width: 480px;
    }
  }

  @media (max-width: 960px) {
    & :is(svg, img) {
      max-width: 460px;
    }
  }

  @media (max-width: 880px) {
    right: 9%;
    & :is(svg, img) {
      max-width: 400px;
    }
  }
`;

const IconBox = styled.div`
  position: absolute;
  bottom: 20px;
  right: 4%;
  z-index: 15;

  @media (max-width: 1240px) {
    & :is(svg, img) {
      right: 2%;
      max-width: 330px;
    }
  }

  @media (max-width: 1100px) {
    & :is(svg, img) {
      right: 0;
      max-width: 310px;
    }
  }

  @media (max-width: 960px) {
    bottom: 0;
    & :is(svg, img) {
      right: 0;
      max-width: 310px;
    }
  }

  @media (max-width: 880px) {
    bottom: -20px;
    & :is(svg, img) {
      top: 20px;
      right: 0;
      max-width: 250px;
    }
  }
`;

const CoursesSection = styled.section`
  display: flex;
  align-items: stretch;
  width: 100%;
  padding: 100px 50px;
  gap: 20px;
  box-sizing: border-box;

  @media (max-width: 1440px) {
    padding: 100px 0;
  }

  @media (max-width: 1240px) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    justify-content: center;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
  }

  @media (max-width: 450px) {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
`;

const PromoteOnlineSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  gap: 80px;
  box-sizing: border-box;
  position: relative;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px 100px 0 0;

  & .courseCardContainer {
    height: fit-content;
  }

  @media (max-width: 1280px) {
    & .courseCardContainer {
      padding: 40px;
      min-width: unset;
      max-width: 100%;
    }

    & .courseCardIconBox {
      top: -24px;
      right: 3px;
      & :is(svg, img) {
        width: 94px;
        height: 104px;
      }
    }
  }

  @media (max-width: 1100px) {
    gap: 60px;
    padding: 50px;
  }

  @media (max-width: 1024px) {
    gap: 40px;
    padding: 50px 20px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    flex-direction: column;
    gap: 30px;
    align-items: center;
    border-radius: 40px 40px 0 0;
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

const TextBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  max-width: 600px;

  @media (max-width: 1280px) {
    max-width: 500px;
  }

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1180px) {
    max-width: 360px;
  }

  @media (max-width: 1024px) {
    max-width: 460px;
  }

  @media (max-width: 960px) {
    max-width: 360px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
    gap: 30px;
  }
`;

const CardBlock = styled.div`
  display: flex;
  width: 100%;
  max-width: 460px;
`;

const PromoteTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
  word-wrap: break-word;

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

const Paragraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const ContactSection = styled.section`
  display: flex;
  padding: 50px 100px 100px;
  margin: 0 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 0 20px 40px;
    margin: 0 0 60px 0;
    border-radius: 0 0 40px 40px;
  }
`;

export default function Offline() {
  const t = useTranslations("OfflinePage");
  const commonT = useTranslations("Common");
  const offlineCoursesArray = getOfflineCoursesArray((key) => t(key));

  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>{t("hero.title")}</Title>
          <Location>{t("hero.location")}</Location>
          <Description>{t("hero.description")}</Description>
        </TextBox>
        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <SvgAsset
              src="/svg/OfflinePageBackgroundPhoto.webp"
              width={558}
              height={738}
              sizes="(max-width: 767px) 100vw, 0px"
              priority
            />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <SvgAsset
              src="/svg/WarsawMap.webp"
              width={379}
              height={568}
              sizes="(max-width: 550px) 58vw, (max-width: 767px) 95vw, 0px"
            />
          </IconBox>
        </MobileImagesBox>
        <ImageBox id="desktop-only-image-box">
          <SvgAsset
            src="/svg/OfflinePageBackgroundPhoto.webp"
            width={558}
            height={738}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 400px, (max-width: 960px) 460px, (max-width: 1240px) 500px, 558px"
            priority
          />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
          <SvgAsset
            src="/svg/WarsawMap.webp"
            width={379}
            height={568}
            sizes="(max-width: 767px) 0px, (max-width: 880px) 250px, (max-width: 1100px) 310px, 379px"
          />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {offlineCoursesArray.map((course) => (
          <InteractiveCard
            key={course.id}
            title={course.title}
            topRowContent={course.topRowContent}
            bottomRowContent={course.bottomRowContent}
            buttonText={course.buttonText}
            buttonHref={course.buttonHref}
          />
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
          <CourseCard
            icon={<SvgAsset src="/svg/TelegramGlass.webp" width={115} height={130} />}
            title={t("promo.card.title")}
            subtitle={t("promo.card.subtitle")}
            cardContent={
              <CourseList>
                <li>
                  {t("promo.card.items.1.prefix")}{" "}
                  <span style={{ fontWeight: 600 }}>
                    &quot;{t("promo.card.items.1.highlight")}&quot;
                  </span>
                </li>
                <li>{t("promo.card.items.2")}</li>
              </CourseList>
            }
            buttonText={commonT("details")}
            buttonHref="/online"
            bgColor="rgba(200, 204, 210, 0.4)"
          />
        </CardBlock>
      </PromoteOnlineSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
