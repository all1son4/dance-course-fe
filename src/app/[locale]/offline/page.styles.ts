import styled from "styled-components";

import {
  HeroMobileImagesBox,
  HeroSection,
  HeroTextBox,
  HeroTitle,
} from "../_shared/hero.styles";

export const IntroductionSection = styled(HeroSection)`
  min-height: 760px;
  padding: 0 25px;

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
    padding: 100px 20px 0;
  }
`;

export const TextBox = styled(HeroTextBox)`
  max-width: 450px;

  & p:last-of-type {
    font-weight: 300;
    font-style: normal;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    color: rgba(72, 72, 72, 1);
  }

  @media (max-width: 1024px) {
    max-width: 420px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export const MobileImagesBox = styled(HeroMobileImagesBox)`
  position: relative;

  @media (max-width: 767px) {
    & #mobile-only-image-box {
      justify-content: center;
      margin: 10px 0 0 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box :is(svg, img) {
      margin: 0 0 0 1%;
      width: 100%;
      height: auto;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box {
      justify-content: center;
      align-items: center;
      top: unset;
      right: unset;
      bottom: unset;
      height: 100%;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box :is(svg, img) {
      top: unset;
      margin: 0 -50% 0 0;
      width: 95%;
      height: auto;
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-image-box {
      margin: 0;
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-image-box :is(svg, img) {
      margin: 0 0 0 -50px;
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-icon-box {
      justify-content: flex-end;
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-icon-box :is(svg, img) {
      margin: 0;
      width: 58%;
    }
  }
`;

export const Title = styled(HeroTitle)`
  font-size: 55px;
  margin: 0;

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

export const Location = styled.p`
  margin: 0 0 40px 0;

  @media (max-width: 767px) {
    margin: 0 0 30px 0;
  }
`;

export const Description = styled.p`
  margin: 0;
`;

export const ImageBox = styled.div`
  position: absolute;
  top: 88px;
  right: 14%;
  z-index: 10;

  & :is(svg, img) {
    object-fit: contain;
  }

  @media (max-width: 1240px) {
    & :is(svg, img) {
      right: 4%;
      max-width: 500px;
    }
  }

  @media (max-width: 1100px) {
    & :is(svg, img) {
      right: 0;
      max-width: 470px;
    }
  }

  @media (max-width: 960px) {
    & :is(svg, img) {
      max-width: 460px;
    }
  }

  @media (max-width: 880px) {
    top: 140px;
    right: 12%;
    & :is(svg, img) {
      max-width: 380px;
    }
  }
`;

export const IconBox = styled.div`
  position: absolute !important;
  bottom: 20px;
  right: 4%;
  z-index: 15;

  & :is(svg, img) {
    object-fit: contain;
  }

  @media (max-width: 1240px) {
    bottom: 84px;
    & :is(svg, img) {
      right: 2%;
      max-width: 330px;
    }
  }

  @media (max-width: 1100px) {
    bottom: 64px;
    & :is(svg, img) {
      right: 0;
      max-width: 310px;
    }
  }

  @media (max-width: 960px) {
    & :is(svg, img) {
      right: 0;
      max-width: 310px;
    }
  }

  @media (max-width: 880px) {
    right: 20px;
    bottom: 60px;
    & :is(svg, img) {
      max-width: 250px;
    }
  }
`;

export const CoursesSection = styled.section`
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  padding: 100px 50px;
  gap: 20px;
  box-sizing: border-box;

  & > div {
    max-width: 500px;
  }

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

    & > div {
      max-width: unset;
    }
  }

  @media (max-width: 450px) {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
`;

export const PromoteOnlineSection = styled.section`
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

    & .courseCardTitle {
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

export const TextBlock = styled.div`
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

export const CardBlock = styled.div`
  display: flex;
  width: 100%;
  max-width: 460px;
`;

export const PromoteTitle = styled.h2`
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

export const Paragraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;
