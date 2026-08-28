import Image from "next/image";
import styled from "styled-components";

import { SectionTitleBase } from "@/components/common/SectionTitle/SectionTitle.styles";
import { glass } from "@/styles/mixins/glass";

export const IntroduceSection = styled.section`
  position: relative;
  width: 100%;
  min-height: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;

  @media (max-width: 1440px) {
    min-height: 770px;
    padding: 0 20px;
  }

  @media (max-width: 1240px) {
    min-height: 750px;
    padding: 0 20px 0 30px;
  }

  @media (max-width: 920px) {
    padding: 10px 20px 0;
    min-height: 600px;
  }

  @media (max-width: 767px) {
    min-height: unset;
    flex-direction: column-reverse;
    padding: 8px 20px 60px;
  }
`;

export const AbsolutePageImage = styled.div`
  position: absolute;
  top: 0;
  left: 34%;
  z-index: 20;

  & img {
    object-fit: contain;
  }

  @media (max-width: 1440px) {
    left: 32%;
    top: unset;
    bottom: 20px;
    width: 50%;
    height: auto;
  }

  @media (max-width: 1240px) {
    display: none;
  }
`;

export const AbsolutePageLogo = styled.div`
  position: relative;
  z-index: 25;

  & .hero-mobile-bg {
    display: none;
  }

  @media (max-width: 1240px) {
    display: flex;
    flex-direction: column-reverse;
    & .hero-mobile-bg {
      position: relative;
      display: flex;
      height: 750px;
      max-width: 550px;
      object-fit: contain;
    }

    & .hero-brand-logo {
      display: none;
    }
  }

  @media (max-width: 1110px) {
    & .hero-mobile-bg {
      position: relative;
      max-width: 480px;
    }
  }

  @media (max-width: 920px) {
    & .hero-mobile-bg {
      height: 600px;
      max-width: 420px;
    }
  }

  @media (max-width: 767px) {
    & .hero-mobile-bg {
      height: auto;
      max-width: 65%;
      margin: 0 auto;
    }
  }

  @media (max-width: 680px) {
    & .hero-mobile-bg {
      max-width: 80%;
    }
  }

  @media (max-width: 450px) {
    & .hero-mobile-bg {
      max-width: 100%;
    }
  }
`;

export const MainTextBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  z-index: 25;
  max-width: 450px;

  @media (max-width: 920px) {
    max-width: 300px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export const MainTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 90px;
  line-height: 1.3;
  letter-spacing: 0;
  margin: 0 0 20px 0;
  color: var(--ink);

  @media (max-width: 920px) {
    font-size: 50px;
  }

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

export const DescriptionBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  margin: 0 0 40px 0;
  box-sizing: border-box;

  @media (max-width: 920px) {
    margin: 0 0 20px 0;
  }
`;

export const DescriptionTitle = styled.p`
  font-weight: 600;
  font-size: var(--text-body);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const DescriptionText = styled.p`
  font-weight: 300;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
  padding: 0;
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const InteractiveHint = styled.p`
  font-weight: 300;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
  padding: 0;
`;

export const ButtonsBox = styled.div`
  display: flex;
  gap: 20px;

  @media (max-width: 450px) {
    flex-direction: column;
    gap: 15px;
  }
`;

export const AboutMeSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  background: var(--surface);
  border-radius: var(--radius-slab);
  gap: 20px;

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    flex-direction: column;
    border-radius: var(--radius-panel);
    gap: 40px;
  }
`;

export const AboutMeTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 505px;
  align-items: flex-start;

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1110px) {
    max-width: 340px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
  }
`;

export const AboutMeTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-display);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: var(--ink);

  @media (max-width: 880px) {
    font-size: var(--text-h2);
    margin: 0 0 30px 0;
  }
`;

export const AboutMeParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  margin: 40px 0 30px 0;

  @media (max-width: 880px) {
    margin: 30px 0;
  }
`;

export const AboutMeParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0 0 14px 0;
  color: var(--ink);

  &:last-of-type {
    margin: 0;
  }
`;

export const AboutMeList = styled.ul`
  list-style: disc;
  padding-left: 22px;
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

  & > li {
    & a {
      text-underline-offset: 2px;
      text-decoration: underline;
      transition: color 0.2s ease;

      @media (hover: hover) and (pointer: fine) {
        &:hover {
          color: var(--brand);
        }
      }
    }
    margin: 0;
  }
`;

export const AboutMeImageBox = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  max-width: 560px;

  @media (max-width: 880px) {
    margin: 0 auto;
  }
`;

export const AboutMeImageFrame = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 560 / 635;
  border-radius: var(--radius-slab);
  overflow: hidden;

  @media (max-width: 767px) {
    border-radius: var(--radius-panel);
  }
`;

export const StyledImage = styled(Image)`
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-slab);
  object-fit: cover;

  @media (max-width: 767px) {
    border-radius: var(--radius-panel);
  }
`;

export const ImageDescriptionBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

export const IconPositionWrap = styled.div`
  position: absolute;
  z-index: 10;
  left: -36px;
  top: -110px;

  & :is(svg, img) {
    max-width: 80%;
    height: auto;
  }

  @media (max-width: 1240px) {
    left: 60px;
    top: -135px;
  }

  @media (max-width: 880px) {
    left: 60px;
    top: -120px;

    & :is(svg, img) {
      width: 70px;
    }
  }

  @media (max-width: 767px) {
    top: -220px;
    left: 30px;

    & :is(svg, img) {
      width: 60px;
    }
  }

  @media (max-width: 450px) {
    top: -176px;

    & :is(svg, img) {
      width: 50px;
    }
  }
`;

export const ImageDescriptionCard = styled.div`
  padding: 60px;
  max-width: 590px;
  width: 100%;
  margin: -86px 0 0 -98px;

  ${glass({
    radius: "var(--radius-slab)",
    bgParam: "rgba(228, 228, 228, 0.4)",
    frostPx: 14,
    depth: 36,
    hoverEffect: false,
  })}

  @media (max-width: 1240px) {
    margin: -106px 0 0 0;
  }

  @media (max-width: 767px) {
    padding: 30px;
    margin: -200px 0 0 0;
    --glass-radius: var(--radius-panel);
  }

  @media (max-width: 450px) {
    margin: -160px 0 0 0;
    & p {
      font-size: var(--text-small);
    }
  }
`;

export const CourseSection = styled.section`
  padding: 100px 50px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 80px;

  @media (max-width: 1240px) {
    padding: 100px 0px;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    gap: 30px;
  }
`;

export const CourseTitle = styled(SectionTitleBase)`
  letter-spacing: 0;
  color: var(--ink);
`;

export const CourseOptionsBox = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;

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

  @media (max-width: 680px) {
    flex-direction: column;
    gap: 40px;
  }
`;

export const FAQSection = styled.section`
  padding: 50px 50px 100px;
  display: flex;

  @media (max-width: 1240px) {
    padding: 50px 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 50px 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 60px;
  }

  @media (max-width: 680px) {
    padding: 40px 20px;
  }
`;

export const ReviewsSection = styled.section`
  box-sizing: border-box;
  position: relative;
  width: 100%;
  min-width: 0;
  padding: 0 50px 100px;

  @media (max-width: 1240px) {
    padding: 0 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 0 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 0 20px 60px;
  }

  @media (max-width: 680px) {
    padding-bottom: 40px;
  }
`;
