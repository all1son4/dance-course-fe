import styled, { keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  min-width: 0;
  padding: 50px;
  box-sizing: border-box;
  overflow: hidden;

  ${glass({
    radius: "60px",
  })}

  @media (max-width: 767px) {
    padding: 30px 20px;
    gap: 20px;
    border-radius: 40px !important;
  }
`;

export const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Title = styled.h3`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-weight: 400;
  font-style: normal;
  font-size: 28px;
  line-height: 110%;
  letter-spacing: 0;
`;

export const Description = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;

  @media (max-width: 767px) {
    font-size: 15px;
  }
`;

export const PaymentElementShell = styled.div`
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;

  & > div {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
`;

export const PlaceholderState = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px dashed rgba(72, 72, 72, 0.22);
`;

export const PlaceholderLine = styled.span<{ $short?: boolean }>`
  display: block;
  width: ${({ $short }) => ($short ? "52%" : "100%")};
  height: ${({ $short }) => ($short ? "14px" : "48px")};
  border-radius: ${({ $short }) => ($short ? "999px" : "16px")};
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.4) 0%,
    rgba(255, 255, 255, 0.8) 50%,
    rgba(255, 255, 255, 0.4) 100%
  );
`;

export const PlaceholderGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
`;

export const PlaceholderNote = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 300;
  font-style: normal;
  font-size: 14px;
  line-height: 140%;
  letter-spacing: 0;
`;

export const StatusText = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 300;
  font-style: normal;
  font-size: 14px;
  line-height: 140%;
  letter-spacing: 0;
  max-width: 580px;
`;

export const ErrorText = styled(StatusText)`
  color: rgba(213, 0, 4, 1);
`;

export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  align-items: flex-start;
  margin-top: 24px;

  @media (max-width: 767px) {
    align-items: stretch;

    & > button {
      max-width: 100%;
    }
  }
`;

const shimmer = keyframes`
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
`;

const pulse = keyframes`
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.96);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
`;

export const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  overflow: hidden;

  @media (max-width: 767px) {
    padding: 18px;
    border-radius: 24px;
  }
`;

export const LoadingTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
`;

export const LoadingTab = styled.div<{ $isActive?: boolean }>`
  position: relative;
  height: 54px;
  border-radius: 16px;
  border: 1px solid
    ${({ $isActive }) => ($isActive ? "rgba(0, 0, 0, 0.7)" : "rgba(72, 72, 72, 0.14)")};
  background: transparent;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 2s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }
`;

export const LoadingField = styled.div<{ $short?: boolean }>`
  position: relative;
  width: ${({ $short }) => ($short ? "48%" : "100%")};
  height: 54px;
  border-radius: 16px;
  background: transparent;
  border: 1px solid rgba(72, 72, 72, 0.12);
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 1.9s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }

  @media (max-width: 767px) {
    width: 100%;
  }
`;

export const LoadingFieldRow = styled.div`
  display: flex;
  gap: 12px;
  width: 100%;

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;

export const LoadingFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0 0;
  border-top: 1px solid rgba(72, 72, 72, 0.12);
  flex-wrap: wrap;
`;

export const LoadingPulse = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(124, 0, 2, 0.9);
  animation: ${pulse} 1.35s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const LoadingAction = styled.div`
  width: 240px;
  min-height: 56px;
  border-radius: 100px;
  border: 1px solid rgba(72, 72, 72, 0.2);
  background: transparent;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 1.9s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }

  @media (max-width: 767px) {
    width: 100%;
  }
`;
