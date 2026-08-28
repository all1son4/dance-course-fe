import Image from "next/image";
import styled from "styled-components";

import {
  HeroMobileImagesBox,
  HeroSection,
  HeroTextBox,
  HeroTitle,
} from "../../_shared/hero.styles";

export const IntroductionSection = styled(HeroSection)`
  min-height: 920px;
  padding: 0 25px;

  @media (max-width: 1240px) {
    padding: 60px 20px 0;
    min-height: 840px;
  }

  @media (max-width: 920px) {
    min-height: 1020px;
    padding: 80px 20px 0;
  }

  @media (max-width: 767px) {
    min-height: unset;
    padding: 100px 20px 0;
  }
`;

export const TextBox = styled(HeroTextBox)`
  max-width: 580px;

  @media (max-width: 1240px) {
    max-width: 500px;
  }

  @media (max-width: 1024px) {
    max-width: 480px;
  }

  @media (max-width: 920px) {
    max-width: 410px;
  }

  @media (max-width: 920px) {
    & p {
      max-width: 390px;
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
      top: unset;
      right: unset;
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
    & #mobile-only-icon-box {
      margin: 40px 0 0 0;
    }
  }

  @media (max-width: 570px) {
    & #mobile-only-icon-box :is(svg, img) {
      max-width: 100%;
      width: 48%;
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-icon-box {
      margin: 40px 0 0 0;
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-icon-box :is(svg, img) {
      max-width: 100%;
      width: 48%;
    }
  }
`;

export const Title = styled(HeroTitle)`
  font-size: 55px;
  margin: 0 0 40px;

  @media (max-width: 920px) {
    font-size: 50px;
  }

  @media (max-width: 767px) {
    margin: 0 0 30px;
    font-size: 38px;
  }
`;

export const Subtitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 110%;
  letter-spacing: 0;
  color: rgba(0, 0, 0, 1);
  margin: 0 0 20px 0;
`;

export const ImageBox = styled.div`
  position: absolute;
  bottom: 88px;
  right: 10%;
  z-index: 10;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1440px) {
    right: 4%;
  }

  @media (max-width: 1240px) {
    max-width: 500px;
    height: 100%;
    bottom: -40px;
    right: 8%;
  }

  @media (max-width: 1100px) {
    max-width: 470px;
    height: 100%;
    right: 6%;
  }

  @media (max-width: 920px) {
    max-width: 54%;
    bottom: -60px;
  }
`;

export const IconBox = styled.div`
  position: absolute;
  top: 178px;
  right: 1.5%;
  z-index: 15;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1440px) {
    right: -40px;
  }

  @media (max-width: 1240px) {
    max-width: 280px;
    height: 100%;
    top: 170px;
    right: 0;
  }

  @media (max-width: 1100px) {
    max-width: 250px;
  }

  @media (max-width: 920px) {
    max-width: 26%;
    top: 196px;
  }
`;

export const StartNote = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 15px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 10px 0 0;
  color: rgba(72, 72, 72, 1);
`;

export const ButtonBox = styled.div`
  display: grid;
  grid-template-columns: calc(52% - 10px) calc(48% - 10px);
  gap: 20px;
  width: 100%;
  max-width: 100%;

  @media (max-width: 920px) {
    display: flex;
    flex-direction: column;
    max-width: 300px;
  }

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

export const AboutCourseSection = styled.section`
  display: flex;
  width: 100%;
  padding: 150px 0 0 0;
  box-sizing: border-box;
  justify-content: space-between;
  gap: 40px;
  position: relative;

  @media (max-width: 920px) {
    flex-direction: column;
    gap: 30px;
  }

  @media (max-width: 880px) {
    padding: 40px 0 0 0;
  }
`;

export const CourseProgramSection = styled.section`
  display: flex;
  padding: 150px 0 0 0;
  box-sizing: border-box;
  justify-content: space-between;
  width: 100%;
  gap: 40px;

  @media (max-width: 920px) {
    flex-direction: column;
    gap: 30px;
  }

  @media (max-width: 880px) {
    padding: 40px 0 0 0;
  }
`;

export const CourseProgramTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 568px;
  width: 100%;

  @media (max-width: 920px) {
    max-width: 100%;
  }
`;

export const CourseProgramTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 50px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0 0 80px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 920px) {
    margin: 0 0 36px 0;
  }

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const CourseProgramImage = styled(Image)`
  width: 100%;
  max-width: 473px;
  border-radius: 100px;
  height: fit-content;

  @media (max-width: 1240px) {
    max-width: 380px;
  }

  @media (max-width: 920px) {
    max-width: 550px;
    margin: 0 auto;
  }

  @media (max-width: 767px) {
    border-radius: 40px;
  }
`;

export const CourseProgramButtonBox = styled.div`
  display: flex;
  margin: 60px 0 0 85px;
  width: 100%;
  max-width: 310px;

  @media (max-width: 880px) {
    margin: 40px 0 0 85px;
  }

  @media (max-width: 450px) {
    margin: 60px 0 0 55px;
    max-width: 280px;
  }

  @media (max-width: 380px) {
    max-width: 260px;
  }
`;
