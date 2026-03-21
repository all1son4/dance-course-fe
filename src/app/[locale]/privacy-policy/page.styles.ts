import styled from "styled-components";

export const PrivacyPolicySection = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  padding: 180px 0 100px;
  box-sizing: border-box;

  @media (max-width: 880px) {
    padding: 160px 0 60px;
  }

  @media (max-width: 767px) {
    padding: 110px 0 60px;
  }
`;

export const PrivacyPolicyContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 100px;
  box-sizing: border-box;
  border-radius: 100px;
  background: rgba(255, 255, 255, 1);

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    border-radius: 40px;
    padding: 40px 20px;
  }
`;

export const PrivacyPolicyTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: #000000;

  @media (max-width: 880px) {
    font-size: 28px;
    margin: 0 0 30px;
  }
`;

export const PrivacyPolicyDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;

  @media (max-width: 880px) {
    margin: 0 0 30px;
  }
`;

export const PrivacyPolicyEmail = styled.a`
  color: rgba(72, 72, 72, 1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      color: rgba(152, 0, 0, 1);
    }
  }
`;

export const PrivacyPolicyItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 880px) {
    gap: 30px;
  }
`;

export const PrivacyPolicyItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
`;

export const PrivacyPolicyItemTitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 130%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const PrivacyPolicyItemText = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;
`;

export const PrivacyPolicyContactLine = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 32px 0 0;
  color: rgba(72, 72, 72, 1);
  white-space: pre-line;
`;
