import styled from "styled-components";

export const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 914px;
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

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
  max-width: 540px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1240px) {
    max-width: 520px;

    & p {
      max-width: 440px;
    }
  }

  @media (max-width: 1024px) {
    padding: 0;
  }

  @media (max-width: 880px) {
    max-width: 460px;
    & p {
      max-width: 400px;
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
  position: relative;
  display: none;

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
      margin: -18% 0 0 0;
      & :is(svg, img) {
        width: 100%;
        height: auto;
      }
    }

    & #mobile-only-icon-box {
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
      top: unset;
      right: unset;
      bottom: unset;
      width: 100%;
      max-width: 100%;
      height: 100%;
      margin: 20px 0 0 0;
      & :is(svg, img) {
        top: unset;
        width: 50%;
        height: auto;
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
    word-wrap: break-word;
  }
  @media (max-width: 767px) {
    font-size: 38px;
  }
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
  bottom: -70px;
  right: 1.5%;
  z-index: 10;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1240px) {
    max-width: 640px;
    bottom: -100px;
    right: 0;
  }

  @media (max-width: 1140px) {
    max-width: 540px;
    bottom: -150px;
  }

  @media (max-width: 880px) {
    max-width: 490px;
    bottom: -160px;
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
    top: 90px;
    max-width: 320px;
    right: 0;
  }

  @media (max-width: 1140px) {
    top: 120px;
    max-width: 260px;
  }

  @media (max-width: 880px) {
    top: 120px;
    max-width: 240px;
  }
`;

export const DateBox = styled.div`
  display: flex;
  flex-direction: column;
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

export const ButtonBox = styled.div`
  display: flex;
  width: 100%;
  max-width: 300px;

  @media (max-width: 450px) {
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

  @media (max-width: 1024px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    border-radius: 40px;
    margin: 0 0 60px 0;
  }
`;

export const AboutChoreoSection = styled.section`
  display: flex;
  width: 100%;
  padding: 0 0 50px 0;
  box-sizing: border-box;
  justify-content: space-between;
  gap: 40px;

  @media (max-width: 880px) {
    flex-direction: column;
    gap: 30px;
    padding: 0;
  }
`;

export const AboutChoreoCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px;
  width: 100%;

  @media (max-width: 880px) {
    max-width: 100%;
  }
`;

export const AboutChoreoTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  max-width: 420px;

  @media (max-width: 1240px) {
    max-width: 360px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
    font-size: 40px;
  }
`;

export const ChoreoSection = styled.section`
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  padding: 100px 0 150px;
  box-sizing: border-box;
  gap: 30px;
  justify-content: center;
  align-items: stretch;

  & > div {
    width: min(485px, calc((100% - 30px) / 2));
    max-width: 100%;
  }

  @media (max-width: 880px) {
    padding: 40px 0;
  }

  @media (max-width: 767px) {
    flex-direction: column;

    & > div {
      width: 100%;
    }
  }
`;
