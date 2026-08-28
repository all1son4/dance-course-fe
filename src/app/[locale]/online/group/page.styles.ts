import styled from "styled-components";

import { SectionTitleBase } from "@/components/common/SectionTitle/SectionTitle.styles";

import {
  HeroMobileImagesBox,
  HeroSection,
  HeroTextBox,
  HeroTitle,
} from "../../_shared/hero.styles";

export const IntroductionSection = styled(HeroSection)`
  min-height: 860px;
  padding: 0 25px;

  @media (max-width: 1240px) {
    min-height: 800px;
    padding: 60px 20px 0;
  }

  @media (max-width: 920px) {
    padding: 80px 20px 0;
  }

  @media (max-width: 767px) {
    min-height: unset;
    padding: 100px 20px 0;
  }
`;

export const TextBox = styled(HeroTextBox)`
  max-width: 620px;

  @media (max-width: 1240px) {
    max-width: 540px;
  }

  @media (max-width: 1024px) {
    & p {
      max-width: 520px;
    }
  }

  @media (max-width: 920px) {
    & p {
      max-width: 420px;
    }
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }

  @media (max-width: 767px) {
    & p {
      max-width: 100%;
    }
  }
`;

export const MobileImagesBox = styled(HeroMobileImagesBox)`
  position: relative;

  @media (max-width: 767px) {
    & #mobile-only-image-box {
      max-width: 100%;
      justify-content: center;
      margin: clamp(-100px, -15vw, -60px) 0 0 clamp(-60px, -9vw, -20px);
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box :is(svg, img) {
      max-width: 100%;
      width: 90%;
      height: 100%;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box {
      max-width: 100%;
      justify-content: flex-end;
      align-items: flex-start;
      top: 12%;
      right: 6%;
      bottom: unset;
      margin: 20px 0 0 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box :is(svg, img) {
      max-width: 100%;
      width: 50%;
      height: fit-content;
    }
  }

  @media (max-width: 570px) {
    & #mobile-only-icon-box :is(svg, img) {
      max-width: 100%;
      width: 48%;
      top: 4%;
    }
  }
`;

export const Title = styled(HeroTitle)`
  font-size: var(--text-display);
  margin: 0 0 40px;
  white-space: pre-line;
  max-width: 420px;

  @media (max-width: 920px) {
    font-size: 50px;
  }

  @media (max-width: 767px) {
    margin: 0 0 30px;
    font-size: 38px;
  }
`;

export const ImageBox = styled.div`
  position: absolute;
  bottom: 38px;
  right: 10%;
  z-index: 10;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1440px) {
    right: 7%;
  }

  @media (max-width: 1240px) {
    max-width: 580px;
    height: 100%;
    bottom: 20px;
  }

  @media (max-width: 1100px) {
    max-width: 540px;
    height: 100%;
    right: 1%;
  }

  @media (max-width: 920px) {
    max-width: 510px;
    right: 0;
    bottom: -10px;
  }
`;

export const IconBox = styled.div`
  position: absolute;
  max-width: 420px;
  top: 200px;
  right: 0;
  z-index: 15;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1440px) {
    max-width: 410px;
    top: 220px;
    right: -40px;
  }

  @media (max-width: 1240px) {
    max-width: 370px;
    height: 100%;
    top: 230px;
    right: -12px;
  }

  @media (max-width: 1100px) {
    max-width: 300px;
    right: -10px;
    top: 240px;
  }

  @media (max-width: 920px) {
    max-width: 250px;
    top: 250px;
  }
`;

export const ButtonBox = styled.div`
  display: grid;
  grid-template-columns: calc(52% - 10px) calc(48% - 10px);
  gap: 20px;
  width: 100%;
  max-width: 100%;

  @media (max-width: 767px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    max-width: 100%;
  }

  @media (max-width: 625px) {
    display: flex;
    flex-direction: column;
    max-width: 100%;
  }
`;

export const TariffSection = styled.section`
  padding: 100px 0px 0px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 80px;

  @media (max-width: 1024px) {
    padding: 100px 0px 0px;
  }

  @media (max-width: 880px) {
    padding: 40px 0px 0px;
    gap: 30px;
  }
`;

export const TariffTitle = styled(SectionTitleBase)`
  letter-spacing: 0;
  color: var(--ink);
`;

export const TariffOptionsBox = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 40px;
  align-items: stretch;
  width: 100%;

  & .courseCardContainer {
    min-width: 0;
    gap: 20px;
    justify-content: flex-start;
  }

  & .courseCardContent {
    height: 100%;

    & > div {
      height: 100%;
      justify-content: space-between;
    }
  }

  & .courseCardContentBox {
    height: 100%;
  }

  & .courseCardTitle,
  & .courseCardSubtitle {
    text-wrap: balance;
  }

  @media (max-width: 920px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;

    & .courseCardContainer {
      width: 100%;
      max-width: 720px;
      justify-self: center;
    }

    & .courseCardContent,
    & .courseCardContentBox {
      height: auto;
    }
  }

  @media (max-width: 880px) {
    & .courseCardContainer {
      border-radius: var(--radius-panel);
    }
  }

  @media (max-width: 767px) {
    & .courseCardContainer {
      padding: 30px;
      gap: 30px;
    }

    & .courseCardTitle {
      font-size: var(--text-card);
    }

    & .courseCardButton {
      max-width: 100%;
    }
  }

  @media (max-width: 550px) {
    gap: 24px;
  }
`;

export const TarifContentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

export const TariffContentList = styled.ul`
  list-style-position: outside;
  padding: 0 0 0 22px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink);

  & li {
    margin: 0;
    padding-left: 3px;
    text-wrap: pretty;
  }

  & li::marker {
    color: rgba(124, 0, 2, 0.78);
  }

  @media (max-width: 550px) {
    gap: 8px;
    padding-left: 20px;
    font-size: var(--text-body-sm);
    line-height: 1.45;
  }
`;

export const AboutCourseSection = styled.section`
  display: flex;
  width: 100%;
  padding: 150px 0 0 0;
  box-sizing: border-box;
  justify-content: space-between;
  gap: 40px;

  @media (max-width: 920px) {
    flex-direction: column;
    gap: 30px;
  }

  @media (max-width: 880px) {
    padding: 40px 0 0 0;
  }
`;
