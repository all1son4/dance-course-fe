import styled from "styled-components";

export const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 860px;
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

  @media (max-width: 1240px) {
    min-height: 800px;
    padding: 60px 20px 0;
  }

  @media (max-width: 920px) {
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
  max-width: 620px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1240px) {
    max-width: 540px;
  }

  @media (max-width: 1024px) {
    padding: 0;
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
      top: 12%;
      right: 6%;
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
      & :is(svg, img) {
        max-width: 100%;
        width: 48%;
        top: 4%;
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
    max-width: 520px;
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
    max-width: 270px;
    top: 230px;
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

export const TariffSection = styled.section`
  padding: 100px 0px 0px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 80px;

  @media (max-width: 1024px) {
    padding: 100px 20px 0px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 0px;
    gap: 30px;
  }
`;

export const TariffTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const TariffOptionsBox = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;

  & .courseCardContainer {
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

export const TarifContentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

export const TariffContentList = styled.ul`
  list-style: inside;
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
  position: sticky;
  top: calc(116px + var(--safe-area-top));
  align-self: start;

  @media (max-width: 920px) {
    max-width: 100%;
    position: static;
    top: auto;
  }

  @media (max-width: 880px) {
    font-size: 40px;
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
