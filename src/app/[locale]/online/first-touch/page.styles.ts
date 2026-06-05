import Image from "next/image";
import styled from "styled-components";

export const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  // min-height: 914px;
  min-height: 920px;
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

  @media (max-width: 1240px) {
    padding: 60px 20px 0;
    // min-height: 740px;
    min-height: 840px;
  }

  @media (max-width: 920px) {
    // min-height: 914px;
    min-height: 1020px;
    padding: 80px 20px 0;
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

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 580px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1240px) {
    max-width: 500px;
  }

  @media (max-width: 1024px) {
    padding: 0;
    max-width: 480px;
  }

  @media (max-width: 920px) {
    max-width: 410px;

    & p {
      max-width: 390px;
    }
  }

  @media (max-width: 767px) {
    max-width: 100%;
    & p {
      max-width: 100%;
    }
  }
`;

export const MobileImagesBox = styled.div`
  display: none;
  position: relative;

  @media (max-width: 767px) {
    display: flex;
    width: 100%;

    & #mobile-only-image-box {
      position: relative;
      display: flex;
      width: 100%;
      max-width: 100%;
      justify-content: center;
      top: unset;
      right: unset;
      bottom: unset;
      margin: clamp(-100px, -15vw, -60px) 0 0 clamp(-60px, -9vw, -20px);
      & :is(svg, img) {
        max-width: 100%;
        width: 90%;
        height: 100%;
      }
    }

    & #mobile-only-icon-box {
      display: flex;
      width: 100%;
      max-width: 100%;
      justify-content: flex-end;
      align-items: flex-start;
      top: unset;
      right: unset;
      bottom: unset;
      margin: 20px 0 0 0;
      & :is(svg, img) {
        max-width: 100%;
        width: 50%;
        height: fit-content;
      }
    }
  }

  @media (max-width: 570px) {
    & #mobile-only-icon-box {
      margin: 40px 0 0 0;
      & :is(svg, img) {
        max-width: 100%;
        width: 48%;
      }
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-icon-box {
      margin: 40px 0 0 0;
      & :is(svg, img) {
        max-width: 100%;
        width: 48%;
      }
    }
  }
`;

export const Title = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: rgba(0, 0, 0, 1);

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

export const Description = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 60px 0;
`;

export const DescriptionParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(12, 12, 12, 1);
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
    right: 8%;
  }

  @media (max-width: 1240px) {
    max-width: 500px;
    height: 100%;
    bottom: -40px;
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
    right: 0;
  }

  @media (max-width: 1240px) {
    max-width: 280px;
    height: 100%;
    top: 170px;
  }

  @media (max-width: 1100px) {
    max-width: 250px;
  }

  @media (max-width: 920px) {
    max-width: 26%;
    top: 196px;
  }
`;

export const DateBox = styled.div`
  display: flex;
  flex-direction: column;
`;

export const InfoBoxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 0 30px 0;
`;

export const From = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const Date = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
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

export const SpecialWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0 0 100px 0;
  padding: 100px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 1);

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    border-radius: 40px;
    margin: 0 0 60px 0;
  }
`;

export const VideoSection = styled.section`
  display: flex;
  width: 100%;
  box-sizing: border-box;
  border-radius: 100px;
  overflow: hidden;
  position: relative;

  @media (max-width: 880px) {
    border-radius: 40px;
  }

  @media (max-width: 650px) {
    & button {
      width: 55px;
      height: 55px;
    }

    & button svg {
      width: 32px;
      height: 32px;
    }
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

export const AboutCourseCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px;
  width: 100%;

  @media (max-width: 920px) {
    max-width: 100%;
  }
`;

export const AboutCourseTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  max-width: 420px;

  @media (max-width: 920px) {
    max-width: 100%;
  }

  @media (max-width: 880px) {
    font-size: 40px;
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

export const ContactSection = styled.section`
  display: flex;
  padding: 150px 0 0 0;
  box-sizing: border-box;

  @media (max-width: 880px) {
    padding: 40px 0 0 0;
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
