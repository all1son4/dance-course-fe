import styled from "styled-components";

import { Link } from "@/i18n/navigation";
import { glass } from "@/styles/mixins/glass";

export const PaymentSection = styled.section`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 1240px;
  justify-content: space-between;
  margin: 200px auto 100px;
  position: relative;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }

  @media (max-width: 920px) {
    flex-direction: column;
    margin: 130px auto 80px;
  }

  @media (max-width: 767px) {
    margin: 100px auto 60px;
  }
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 50px;
  width: 100%;
  max-width: 660px;
  min-width: 0;
  position: relative;

  @media (max-width: 920px) {
    max-width: 100%;
    gap: 30px;
  }
`;

export const TextBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 920px) {
    gap: 20px;
  }
`;

export const PaymentTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 50px;
  }
`;

export const PaymentDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: rgba(72, 72, 72, 1);
  margin: 0;

  @media (max-width: 767px) {
    font-size: 15px;
  }
`;

export const FormBox = styled.form`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
`;

export const PersonalData = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  padding: 50px;
  box-sizing: border-box;

  ${glass({
    radius: "60px",
  })}

  @media (max-width: 767px) {
    gap: 30px;
    padding: 30px 20px;
    border-radius: 40px !important;
  }
`;

export const StripeReveal = styled.div<{ $isVisible: boolean }>`
  position: relative;
  z-index: 1;
  padding-top: ${({ $isVisible }) => ($isVisible ? "20px" : "0")};
  width: 100%;
  min-width: 0;
  overflow: ${({ $isVisible }) => ($isVisible ? "unset" : "hidden")};
  max-height: ${({ $isVisible }) => ($isVisible ? "920px" : "0")};
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? "0" : "-18px")});
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transition:
    padding-top 0.45s ease,
    max-height 0.45s ease,
    opacity 0.16s ease,
    transform 0.45s ease;

  @media (max-width: 767px) {
    max-height: ${({ $isVisible }) => ($isVisible ? "1240px" : "0")};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const PersonalDataTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 28px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const Inputs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;

  @media (max-width: 767px) {
    gap: 20px;
  }
`;

export const Checkboxes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

export const SummaryBoxDesktop = styled.div`
  display: flex;
  width: 100%;
  max-width: 480px;
  height: fit-content;
  position: sticky;
  top: 200px;
  right: 0;

  @media (max-width: 1140px) {
    max-width: 420px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
  }

  @media (max-width: 920px) {
    display: none;
  }
`;

export const SummaryBoxMobile = styled.div`
  display: none;
  width: 100%;
  max-width: 100%;

  @media (max-width: 920px) {
    display: flex;
  }

  @media (max-width: 767px) {
    position: sticky;
    top: calc(86px + var(--safe-area-top));
    z-index: 30;
  }
`;

export const SummaryTopContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const SummaryBoxParahraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin: 0 0 40px 0;

  & p {
    font-weight: 300;
    font-style: normal;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    margin: 0;
    color: rgba(72, 72, 72, 1);
  }
`;

export const SummaryBottomContent = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;

  @media (max-width: 365px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const CurrencyBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;

  @media (max-width: 920px) {
    & [role="radiogroup"] {
      max-width: 146px;
      height: 40px;
    }

    & [role="radio"] {
      padding: 0 18px;
      font-size: 15px;
    }
  }
`;

export const MoneyTitle = styled.p`
  font-weight: 500;
  font-style: normal;
  font-size: 15px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const PriceBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;

  @media (max-width: 365px) {
    align-items: flex-start;
  }
`;

export const Price = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 920px) {
    font-size: 30px;
  }

  @media (max-width: 767px) {
    font-size: 28px;
  }
`;

export const AdditionalNotification = styled.div`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 140%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);

  @media (max-width: 767px) {
    font-size: 15px;
  }
`;

export const AgreementLink = styled(Link)`
  text-decoration: underline;
  text-underline-offset: 2px;
  color: rgba(72, 72, 72, 1);
  transition: color 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: #000000;
    }
  }
`;
