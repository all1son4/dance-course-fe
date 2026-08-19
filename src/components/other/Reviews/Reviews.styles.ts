import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const ReviewsContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 80px;

  @media (max-width: 880px) {
    gap: 30px;
  }
`;

export const ReviewsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
`;

export const Title = styled.h2`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-size: 55px;
  font-style: normal;
  font-weight: 400;
  line-height: 110%;

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const ReviewNavigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 12px;

  @media (max-width: 880px) {
    display: none;
  }
`;

export const NavigationButtonBox = styled.div`
  width: 52px;
  height: 52px;
  flex: 0 0 52px;

  & > button {
    width: 52px;
    height: 52px;
    min-height: 52px;
    padding: 0;
  }

  & svg {
    width: 28px;
    height: 28px;
    stroke-width: 1.5;
  }
`;

export const ReviewsSlider = styled.div`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;

  & .swiper {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  & .swiper-wrapper {
    align-items: flex-start;
    transition-property: transform, height;
  }

  & .swiper-slide {
    box-sizing: border-box;
    display: flex;
    align-self: flex-start;
    height: auto;
  }
`;

export const ReviewCard = styled.article`
  ${glass({
    frost: "static",
    radius: "60px",
    bgParam: "rgba(228, 228, 228, 0.4)",
    shadowStrength: 0.1,
    hoverEffect: false,
  })}

  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 100%;
  padding: clamp(32px, 3vw, 48px);

  @media (max-width: 767px) {
    padding: 30px;
    --glass-radius: 40px;
  }
`;

export const ReviewTitleBox = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 10px;

  & svg {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    stroke-width: 1.4;
  }
`;

export const ReviewTitle = styled.p`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-size: 20px;
  font-style: normal;
  font-weight: 300;
  letter-spacing: 0;
  line-height: 150%;

  @media (max-width: 450px) {
    font-size: 17px;
  }
`;

export const ReviewParagraphs = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
`;

export const ReviewParagraph = styled.p`
  margin: 0 0 14px;
  color: rgba(0, 0, 0, 1);
  font-size: 17px;
  font-style: normal;
  font-weight: 300;
  letter-spacing: 0;
  line-height: 150%;

  &:last-of-type {
    margin-bottom: 0;
  }

  @media (max-width: 450px) {
    font-size: 15px;
  }
`;
