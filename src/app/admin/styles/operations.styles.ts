import styled from "styled-components";

import { focusRing } from "./shared.styles";

export type HealthToneStyleProps = {
  $tone: "alert" | "ok" | "warn";
};

const HEALTH_TONE_COLORS = {
  alert: {
    background: "rgba(176, 24, 33, 0.055)",
    border: "rgba(176, 24, 33, 0.18)",
    text: "rgba(138, 18, 27, 0.94)",
  },
  ok: {
    background: "rgba(24, 112, 58, 0.055)",
    border: "rgba(24, 112, 58, 0.18)",
    text: "rgba(21, 88, 44, 0.94)",
  },
  warn: {
    background: "rgba(160, 96, 12, 0.06)",
    border: "rgba(160, 96, 12, 0.2)",
    text: "rgba(128, 76, 8, 0.94)",
  },
} as const;

export const HealthBanner = styled.section<HealthToneStyleProps>`
  border-radius: 18px;
  border: 1px solid ${({ $tone }) => HEALTH_TONE_COLORS[$tone].border};
  background: ${({ $tone }) => HEALTH_TONE_COLORS[$tone].background};
  padding: clamp(14px, 1.5vw, 18px);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: ${({ $tone }) => HEALTH_TONE_COLORS[$tone].text};
`;

export const HealthBannerBody = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;

  > svg {
    width: 21px;
    height: 21px;
    flex: 0 0 auto;
    margin-top: 1px;
    stroke-width: 2;
  }
`;

export const HealthBannerTitle = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 680;
  line-height: 1.35;
  letter-spacing: -0.01em;
`;

export const HealthBannerText = styled.p`
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.82;
`;

export const SystemList = styled.ul`
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
`;

export const SystemRow = styled.li`
  border-bottom: 1px solid rgba(24, 24, 24, 0.06);

  &:last-child {
    border-bottom: 0;
  }
`;

export const SystemRowStatic = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 2px;

  @media (max-width: 620px) {
    align-items: flex-start;
  }
`;

export const SystemAccordion = styled.details`
  summary {
    ${focusRing}
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 2px;
    list-style: none;
    cursor: pointer;

    @media (max-width: 620px) {
      align-items: flex-start;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  &[open] summary {
    padding-bottom: 8px;
  }
`;

export const SystemSummaryEnd = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;

  > svg {
    width: 15px;
    height: 15px;
    color: rgba(70, 70, 70, 0.55);
    transition: transform 0.18s ease;
  }

  details[open] & > svg {
    transform: rotate(90deg);
  }
`;

export const SystemBody = styled.div`
  padding: 0 2px 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SystemBodyNote = styled.p`
  margin: 0;
  padding: 9px 11px;
  border: 1px dashed rgba(24, 24, 24, 0.12);
  border-radius: 11px;
  background: rgba(248, 248, 247, 0.6);
  color: rgba(58, 58, 58, 0.78);
  font-size: 11.5px;
  line-height: 1.5;
`;

export const SystemInfo = styled.div`
  min-width: 0;
`;

export const SystemName = styled.p`
  margin: 0;
  color: rgba(22, 22, 22, 0.94);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
`;

export const SystemDetail = styled.p`
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: rgba(58, 58, 58, 0.72);
  font-size: 11.5px;
  line-height: 1.45;
`;

export const TechDetails = styled.details`
  margin-top: 10px;
  border-top: 1px dashed rgba(24, 24, 24, 0.1);
  padding-top: 10px;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    list-style: none;
    cursor: pointer;
    color: rgba(72, 72, 72, 0.66);
    font-size: 11px;
    font-weight: 620;
    letter-spacing: 0.03em;

    svg {
      width: 13px;
      height: 13px;
      transition: transform 0.18s ease;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  &[open] summary svg {
    transform: rotate(90deg);
  }
`;

export const TechDetailRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 2px 0;
  color: rgba(58, 58, 58, 0.74);
  font-size: 11px;
  line-height: 1.5;

  > span:last-child {
    flex-shrink: 0;
    color: rgba(24, 24, 24, 0.88);
    font-weight: 600;
  }
`;
