import styled from "styled-components";

import PageContainer from "@/components/layout/PageContainer";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
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
      radial-gradient(circle at 12% 18%, rgba(124, 0, 2, 0.15), transparent 38%),
      radial-gradient(circle at 87% 8%, rgba(18, 18, 18, 0.07), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08));
    pointer-events: none;
  }
`;

const Inner = styled(PageContainer)`
  width: 100%;
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 1;
`;

const Panel = styled.section`
  width: min(780px, 100%);
  ${glass({
    radius: "42px",
    bgParam: "rgba(255, 255, 255, 0.42)",
    frostPx: 10,
    depth: 40,
  })}
  padding: 52px 38px 42px;
  text-align: center;
  margin: 0 auto;

  @media (max-width: 767px) {
    border-radius: 34px !important;
    padding: 34px 20px 28px;
  }
`;

const LogoWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
`;

const Eyebrow = styled.p`
  margin: 0 0 16px 0;
  font-size: 12px;
  line-height: 17px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(72, 72, 72, 0.94);
`;

const Title = styled.h1`
  margin: 0 0 24px 0;
  font-size: clamp(34px, 5.8vw, 58px);
  line-height: 0.95;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: rgba(16, 16, 16, 0.96);
`;

const Subtitle = styled.p`
  margin: 0 auto;
  max-width: 590px;
  font-size: clamp(16px, 2.5vw, 20px);
  line-height: 1.5;
  font-weight: 300;
  color: rgba(46, 46, 46, 0.84);
`;

const Support = styled.a`
  display: inline-flex;
  margin-top: 28px;
  padding: 12px 24px;
  border-radius: 999px;
  text-decoration: none;
  ${glass({
    radius: "100px",
    bgParam: "rgba(124, 0, 2, 1)",
  })}
  color: rgba(255, 255, 255, 1);
  font-size: 16px;
  line-height: 1;
  font-weight: 400;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${glass({
        radius: "100px",
        bgParam: "rgba(11, 11, 11, 1)",
      })}
      text-decoration: none;
    }
  }
`;

export default function SiteComingSoon() {
  return (
    <Screen>
      <Inner>
        <Panel>
          <LogoWrap>
            <Logo width={320} height={62} />
          </LogoWrap>
          <Eyebrow>Website Update In Progress</Eyebrow>
          <Title>Coming Soon</Title>
          <Subtitle>
            We are preparing an updated launch. The full website experience will be
            available again very soon.
          </Subtitle>
          <Support href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            Contact Support
          </Support>
        </Panel>
      </Inner>
    </Screen>
  );
}
