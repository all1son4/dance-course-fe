import styled from "styled-components";

import {
  HeroMobileImagesBox,
  HeroSection,
  HeroTextBox,
  HeroTitle,
} from "../../_shared/hero.styles";

export const IntroductionSection = styled(HeroSection)`
  min-height: 914px;
  padding: 0 25px;

  @media (max-width: 1240px) {
    min-height: 800px;
    padding: 40px 20px 0;
  }

  @media (max-width: 1140px) {
    min-height: 740px;
    padding: 100px 20px 0;
  }

  @media (max-width: 920px) {
    padding: 60px 20px 0;
  }

  @media (max-width: 767px) {
    min-height: unset;
    padding: 100px 20px 0;
  }
`;

export const TextBox = styled(HeroTextBox)`
  max-width: 540px;

  @media (max-width: 1240px) {
    max-width: 520px;
  }

  @media (max-width: 1240px) {
    & p {
      max-width: 440px;
    }
  }

  @media (max-width: 880px) {
    max-width: 460px;
  }

  @media (max-width: 880px) {
    & p {
      max-width: 400px;
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
      margin: -18% 0 0 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box :is(svg, img) {
      width: 100%;
      height: auto;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box {
      justify-content: flex-end;
      align-items: flex-start;
      top: unset;
      right: unset;
      bottom: unset;
      max-width: 100%;
      height: 100%;
      margin: 20px 0 0 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box :is(svg, img) {
      top: unset;
      width: 50%;
      height: auto;
    }
  }
`;

export const Title = styled(HeroTitle)`
  font-size: var(--text-display);
  margin: 0 0 40px;

  @media (max-width: 920px) {
    font-size: 50px;
    word-wrap: break-word;
  }

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

export const ImageBox = styled.div`
  position: absolute;
  bottom: -70px;
  right: 1.5%;
  z-index: 10;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1240px) {
    max-width: 640px;
    bottom: 0;
    right: 0;
  }

  @media (max-width: 1140px) {
    max-width: 540px;
  }

  @media (max-width: 880px) {
    max-width: 490px;
    bottom: 30px;
    right: -10px;
  }
`;

export const IconBox = styled.div`
  position: absolute;
  top: 139px;
  right: 1%;
  z-index: 15;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1240px) {
    top: 130px;
    max-width: 320px;
    right: 0;
  }

  @media (max-width: 1140px) {
    top: 160px;
    max-width: 260px;
  }

  @media (max-width: 880px) {
    top: 180px;
    right: -4px;
    max-width: 240px;
  }
`;

export const ButtonBox = styled.div`
  display: flex;
  width: 100%;
  max-width: 300px;

  @media (max-width: 450px) {
    max-width: 100%;
  }
`;

export const ChoreoSection = styled.section`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  padding: 100px 0 150px;
  box-sizing: border-box;
  gap: 30px;
  align-items: stretch;

  & > * {
    width: 100%;
    max-width: 480px;
    flex: 1 1 310px;
    min-width: 0;
  }

  @media (max-width: 880px) {
    padding: 40px 0;
    gap: 24px;
  }
`;

/* Referenced by the preserved (commented-out) hero markup in page.tsx; the
   definitions now live in the shared section styles. */
export { Date, From } from "../_shared/section.styles";
