import Image from "next/image";
import styled from "styled-components";

export const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 814px;
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

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
    flex-direction: column;

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
  max-width: 450px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1140px) {
    max-width: 400px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
    padding: 0;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export const Title = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  & p {
    font-weight: 300;
    font-style: normal;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    color: rgba(72, 72, 72, 1);
  }

  @media (max-width: 920px) {
    font-size: 40px;
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

export const MobileImagesBox = styled.div`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    position: relative;
    width: 100%;

    & #mobile-only-image-box {
      position: relative;
      display: flex;
      justify-content: flex-start;
      top: unset;
      right: unset;
      bottom: unset;
      width: 100%;
      margin: clamp(-150px, -24vw, -80px) 0 0 0;

      & :is(svg, img) {
        margin: 0 0 0 clamp(-100px, -14vw, -60px);
        width: 100%;
      }
    }

    & #mobile-only-icon-box {
      display: flex;
      justify-content: flex-end;
      top: 10%;
      right: 0;
      width: 100%;

      & :is(svg, img) {
        width: 65%;
      }
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-icon-box {
      & :is(svg, img) {
        width: 62%;
      }
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-icon-box {
      top: 15%;
    }
  }
`;

export const CoursesSection = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;
  justify-content: center;
  padding: 100px 0;

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
    flex-direction: column;
    align-items: center;
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
  background: rgba(255, 255, 255, 1);

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
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
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
  font-style: light;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const StudioDanceImage = styled(Image)`
  border-radius: 100px;
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
    border-radius: 40px;
  }
`;

export const ContactSection = styled.section`
  display: flex;
  padding: 150px 100px 100px;
  margin: -1px 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;

  @media (max-width: 1100px) {
    padding: 150px 50px 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    border-radius: 0 0 40px 40px;
    margin: -1px 0 60px 0;
  }
`;
