import styled from "styled-components";

/**
 * This page opens straight into the drop instead of a full-height hero, so it
 * carries the clearance the fixed header needs - the same offset the checkout
 * page uses, which is the site's other heroless page.
 */
export const BirthdayDropPageSection = styled.section`
  width: 100%;
  padding-top: 140px;
  box-sizing: border-box;

  @media (max-width: 767px) {
    padding-top: 90px;
  }
`;

export const BirthdayBlock = styled.div`
  display: flex;
  width: 100%;
  background: linear-gradient(97.32deg, #4c151c 6.97%, #7c0002 100.63%);
  padding: 40px 80px;
  gap: 80px;
  position: relative;
  border-radius: 60px;
  margin: 0 0 150px 0;

  @media (max-width: 1440px) {
    gap: 60px;
  }

  @media (max-width: 1240px) {
    padding: 40px 40px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    gap: 40px;
    margin: 0 0 40px 0;
    border-radius: 40px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;

export const BirthdayTextContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 480px;

  @media (max-width: 1440px) {
    max-width: 460px;
  }

  @media (max-width: 1350px) {
    max-width: 400px;
  }

  @media (max-width: 1240px) {
    max-width: 300px;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export const BirthdayTextContentTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  margin: 0;
  color: rgba(255, 255, 255, 1);

  @media (max-width: 767px) {
    font-size: 30px;
    padding: 0 100px 0 0;
  }
`;

export const BirthdayTextContentDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  margin: 0;
  color: rgba(255, 255, 255, 1);
`;

export const BirthdayContentButtons = styled.div`
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 20px 0 0 0;

  @media (max-width: 1350px) {
    flex-direction: column;

    & a {
      max-width: 100%;
    }
  }
`;

export const BirthdayVideoContent = styled.div`
  display: flex;
  position: relative;
  width: 100%;
  border-radius: 50px;
  overflow: hidden;

  @media (max-width: 880px) {
    border-radius: 40px;
  }

  @media (max-width: 767px) {
    & button {
      width: 70px;
      height: 70px;
    }
  }
`;

export const AbsoluteIconBox = styled.div`
  position: absolute;
  top: -104px;
  right: -40px;
  z-index: 10;
  width: 200px;
  height: auto;

  @media (max-width: 1024px) {
    width: 160px;
    right: -20px;
    top: -80px;
  }

  @media (max-width: 880px) {
    width: 140px;
    right: -10px;
  }

  @media (max-width: 767px) {
    width: 120px;
    right: -14px;
    top: -108px;
  }
`;
