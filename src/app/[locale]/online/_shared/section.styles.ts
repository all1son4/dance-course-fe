import styled, { css } from "styled-components";

/**
 * The white rounded slab and the about-cards grid inside it. Shared by the
 * choreography page and The Birthday Drop page, which lay out that section the
 * same way.
 */
/*
 * The white slab that holds a product page's body. Two breakpoint flavours
 * exist historically (`$compactAt`), and the choreo/birthday pages also lift
 * the slab above the hero art (`$stacked`); both are kept as props so each
 * page's CSS stays exactly what it was.
 */
export const SpecialWrapper = styled.div<{
  $compactAt?: 1024 | 1100;
  $stacked?: boolean;
}>`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0 0 100px 0;
  padding: 100px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 1);
  ${({ $stacked = true }) =>
    $stacked &&
    css`
      position: relative;
      z-index: 12;
    `}

  @media (max-width: ${({ $compactAt = 1024 }) => $compactAt}px) {
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
  padding: 0 0 150px 0;
  box-sizing: border-box;
  justify-content: space-between;
  gap: 40px;

  @media (max-width: 880px) {
    flex-direction: column;
    gap: 30px;
    padding: 0 0 40px 0;
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
  position: sticky;
  top: calc(116px + var(--safe-area-top));
  align-self: start;

  @media (max-width: 1240px) {
    max-width: 360px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
    font-size: 40px;
    position: static;
    top: auto;
  }
`;

/* ---------- hero text column, shared by the course/choreo pages ---------- */

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

export const InfoBoxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 0 0 30px 0;
`;

export const DateBox = styled.div`
  display: flex;
  flex-direction: column;
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

/* ---------- course pages (First Touch, Online Group) ---------- */

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
