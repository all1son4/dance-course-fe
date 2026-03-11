import styled, { keyframes } from "styled-components";

import PageContainer from "@/components/layout/PageContainer";
import { glass } from "@/styles/mixins/glass";
import { Logo } from "@/svg";

const Screen = styled.main`
  position: relative;
  min-height: 100dvh;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 10% 16%, rgba(124, 0, 2, 0.14), transparent 36%),
      radial-gradient(circle at 88% 10%, rgba(18, 18, 18, 0.08), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08));
    pointer-events: none;
  }
`;

const Inner = styled(PageContainer)`
  width: 100%;
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 1;
  padding-left: 20px;
  padding-right: 20px;
`;

const Panel = styled.section`
  width: min(720px, 100%);
  ${glass({
    radius: "60px",
    bgParam: "rgba(255, 255, 255, 0.42)",
    frostPx: 10,
    depth: 38,
  })}
  padding: 50px;
  text-align: center;
  margin: 0 auto;

  @media (max-width: 880px) {
    border-radius: 40px !important;
    padding: 30px;
  }
`;

const LogoWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 22px;
`;

const StatusChip = styled.div`
  width: fit-content;
  margin: 0 auto 14px auto;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(72, 72, 72, 0.2);
  background: rgba(255, 255, 255, 0.56);
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: rgba(72, 72, 72, 0.92);
`;

const Title = styled.h1`
  margin: 0;
  font-size: 48px;
  line-height: 1.02;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: rgba(16, 16, 16, 0.96);
  margin: 0 0 24px; 0;

  @media (max-width: 767px) {
    font-size: 38px;
  }
`;

const Subtitle = styled.p`
  margin: 12px auto 0 auto;
  max-width: 500px;
  font-size: 17px;
  line-height: 1.38;
  font-weight: 300;
  color: rgba(46, 46, 46, 0.84);

  @media (max-width: 767px) {
    font-size: 16px;
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0turn);
  }

  to {
    transform: rotate(1turn);
  }
`;

const orbit = keyframes`
  0% {
    transform: rotate(0turn) translateX(18px);
  }

  100% {
    transform: rotate(1turn) translateX(18px);
  }
`;

const LoaderRow = styled.div`
  margin: 20px auto 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const Ring = styled.span`
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid rgba(124, 0, 2, 0.18);
  border-top-color: rgba(124, 0, 2, 0.9);
  position: relative;
  animation: ${spin} 0.9s linear infinite;

  &::after {
    content: "";
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: rgba(124, 0, 2, 0.9);
    top: 50%;
    left: 50%;
    transform-origin: center;
    animation: ${orbit} 1.8s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: ${spin} 1.6s linear infinite !important;

    &::after {
      animation: ${orbit} 2.8s linear infinite !important;
    }
  }
`;

const LoaderText = styled.span`
  color: rgba(72, 72, 72, 0.88);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
`;

export default function SiteComingSoon() {
  return (
    <Screen>
      <Inner>
        <Panel>
          <LogoWrap>
            <Logo width={320} height={62} />
          </LogoWrap>
          <StatusChip>Update in progress</StatusChip>
          <Title>Be right back.</Title>
          <Subtitle>Final touches now. The updated website goes live very soon.</Subtitle>
          <LoaderRow>
            <Ring aria-hidden />
            <LoaderText>Final checks</LoaderText>
          </LoaderRow>
        </Panel>
      </Inner>
    </Screen>
  );
}
