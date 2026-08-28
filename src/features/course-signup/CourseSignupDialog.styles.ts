import styled, { keyframes } from "styled-components";

/* The result screen's entrance: the icon pops, the message rises after it. */
const resultPop = keyframes`
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const resultRise = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
`;

const POP_EASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";

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
    font-size: var(--text-small);
    line-height: 1.35;
  }

  & input {
    padding: 10px 16px;
    border-radius: 14px;
    font-size: var(--text-body-sm);
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
  animation: ${resultPop} 520ms ${POP_EASE} var(--motion-settle, 40ms) both;

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
  animation: ${resultRise} 480ms var(--ease-standard, ease)
    calc(var(--motion-settle, 40ms) + 140ms) both;

  @media (max-width: 520px) {
    font-size: var(--text-lead);
  }
`;

export const ResultReason = styled.p`
  margin: -12px 0 0;
  color: var(--danger);
  font-size: var(--text-body);
  font-weight: 300;
  line-height: 1.5;
  max-width: 520px;
  animation: ${resultRise} 480ms var(--ease-standard, ease)
    calc(var(--motion-settle, 40ms) + 200ms) both;

  @media (max-width: 520px) {
    font-size: var(--text-body-sm);
  }
`;
