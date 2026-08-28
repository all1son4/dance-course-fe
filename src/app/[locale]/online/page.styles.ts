import Image from "next/image";
import styled from "styled-components";

import {
  HeroMobileImagesBox,
  HeroSection,
  HeroTextBox,
  HeroTitle,
} from "../_shared/hero.styles";

export const IntroductionSection = styled(HeroSection)`
  min-height: 814px;
  padding: 0 25px;

  @media (max-width: 1240px) {
    padding: 0 20px;
  }

  @media (max-width: 1140px) {
    min-height: 750px;
  }

  @media (max-width: 920px) {
    min-height: 620px;
    padding: 180px 20px 0;
  }

  @media (max-width: 880px) {
    padding: 180px 20px 20px;
    align-items: flex-start;
  }

  @media (max-width: 767px) {
    padding: 100px 20px 0;
    min-height: unset;
  }
`;

export const TextBox = styled(HeroTextBox)`
  max-width: 450px;

  @media (max-width: 1140px) {
    max-width: 400px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export const Title = styled(HeroTitle)`
  font-size: var(--text-display);
  margin: 0;

  & p {
    font-weight: 300;
    font-style: normal;
    font-size: var(--text-body);
    line-height: 1.5;
    letter-spacing: 0;
    color: var(--ink-muted);
  }

  @media (max-width: 920px) {
    font-size: var(--text-h2);
  }

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

export const Location = styled.p`
  margin: 0 0 40px 0;
`;

export const Description = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
`;

export const ImageBox = styled.div`
  position: absolute;
  bottom: -32px;
  right: 15%;
  z-index: 10;

  @media (max-width: 1140px) {
    right: 10%;
    & :is(svg, img) {
      width: 550px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    right: 7%;
    bottom: -62px;
    & :is(svg, img) {
      width: 400px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    bottom: 0;
  }
`;

export const IconBox = styled.div`
  position: absolute;
  top: 160px;
  right: 2%;
  z-index: 15;

  @media (max-width: 1240px) {
    right: 0;
  }

  @media (max-width: 1140px) {
    top: 220px;
    & :is(svg, img) {
      width: 350px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    top: 200px;
    & :is(svg, img) {
      width: 250px;
      height: auto;
    }
  }
`;

export const MobileImagesBox = styled(HeroMobileImagesBox)`
  @media (max-width: 767px) {
    position: relative;
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box {
      justify-content: flex-start;
      margin: clamp(-150px, -24vw, -80px) 0 0 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box :is(svg, img) {
      margin: 0 0 0 clamp(-100px, -14vw, -60px);
      width: 100%;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box {
      justify-content: flex-end;
      top: 10%;
      right: 0;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box :is(svg, img) {
      width: 65%;
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-icon-box :is(svg, img) {
      width: 62%;
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-icon-box {
      top: 15%;
    }
  }
`;

export const CoursesSection = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 40px;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  padding: 100px 0;
  box-sizing: border-box;

  & > div {
    max-width: 480px;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
  }

  @media (max-width: 767px) {
    grid-template-columns: 1fr;

    & > div {
      max-width: 100%;
    }
  }
`;

export const StudioDanceSection = styled.section`
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 40px;
  width: 100%;
  padding: 100px 100px 0;
  box-sizing: border-box;
  border-radius: 100px 100px 0 0;
  background: var(--surface);

  @media (max-width: 1100px) {
    padding: 50px 50px 0;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 0;
    flex-direction: column;
    border-radius: 40px 40px 0 0;
  }
`;

export const StudioDanceTextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 550px;
  position: relative;

  @media (max-width: 880px) {
    max-width: 100%;
  }

  @media (max-width: 550px) {
    & button {
      max-width: 100%;
    }
  }
`;

export const StudioDanceTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-display);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: var(--ink);

  @media (max-width: 880px) {
    font-size: var(--text-h2);
  }
`;

export const StudioDanceParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 30px 0;
`;

export const StudioDanceParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;

export const StudioDanceImage = styled(Image)`
  border-radius: var(--radius-slab);
  display: flex;
  width: 100%;
  height: 100%;
  max-width: 502px;

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1024px) {
    max-width: 380px;
  }

  @media (max-width: 880px) {
    max-width: 550px;
    margin: 0 auto;
  }

  @media (max-width: 767px) {
    border-radius: var(--radius-panel);
  }
`;
