import styled from "styled-components";

/**
 * The white rounded slab and the about-cards grid inside it. Shared by the
 * choreography page and the Birthday Drop page, which lay out that section the
 * same way.
 */
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
