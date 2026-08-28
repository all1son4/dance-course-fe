import styled from "styled-components";

/*
 * What the five product heroes (online, choreo, First Touch, Online Group,
 * offline) have in common. Each page extends these with `styled(Base)` and
 * keeps only its own offsets, sizes and breakpoints; the cascade result of
 * base + page delta was checked to be identical to the former per-page CSS at
 * every width from 320 to 1600px.
 */

export const HeroSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;

  @media (max-width: 767px) {
    flex-direction: column;
  }

  @media (max-width: 767px) {
    & #desktop-only-image-box,
    & #desktop-only-icon-box {
      display: none;
    }
  }
`;

export const HeroTextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1024px) {
    padding: 0;
  }
`;

export const HeroTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--ink);
`;

export const HeroMobileImagesBox = styled.div`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    width: 100%;
  }

  @media (max-width: 767px) {
    & #mobile-only-image-box {
      position: relative;
      display: flex;
      top: unset;
      right: unset;
      bottom: unset;
      width: 100%;
    }
  }

  @media (max-width: 767px) {
    & #mobile-only-icon-box {
      display: flex;
      width: 100%;
    }
  }
`;
