import styled from "styled-components";

export const DescriptionSteps = styled.span`
  display: grid;
  gap: 6px;

  & > span {
    display: block;
  }
`;

export const SignupForm = styled.form`
  display: grid;
  gap: 16px;

  & label {
    margin-bottom: 3px;
    font-size: 15px;
    line-height: 1.35;
  }

  & input {
    padding: 10px 16px;
    border-radius: 14px;
    font-size: 16px;
  }
`;

export const ResultState = styled.div`
  display: grid;
  justify-items: center;
  gap: 24px;
  padding: 34px 0 8px;
  text-align: center;
`;

export const ResultIconBox = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 128px;
  height: 128px;

  & img {
    width: 128px;
    height: 128px;
  }
`;

export const ResultText = styled.p<{ $tone: "error" | "success" }>`
  margin: 0;
  color: ${({ $tone }) =>
    $tone === "success" ? "rgba(18, 18, 18, 1)" : "rgba(213, 0, 4, 1)"};
  font-size: 24px;
  font-weight: 400;
  line-height: 1.35;
  max-width: 560px;

  @media (max-width: 520px) {
    font-size: 20px;
  }
`;

export const ResultReason = styled.p`
  margin: -12px 0 0;
  color: rgba(213, 0, 4, 1);
  font-size: 17px;
  font-weight: 300;
  line-height: 1.5;
  max-width: 520px;

  @media (max-width: 520px) {
    font-size: 16px;
  }
`;
