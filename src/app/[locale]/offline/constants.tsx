import type { ReactNode } from "react";
import styled from "styled-components";

import {
  INSTAGRAM_PROFILE_URL,
  TRIAL_REGISTRATION_FORM_VIEW_URL,
} from "@/constants/links";
import { SmallClock, SmallMap } from "@/svg";

export type TInteractiveCard = {
  id: number;
  title: string;
  topRowContent?: ReactNode;
  bottomRowContent?: ReactNode;
  buttonText?: string;
  buttonHref?: string;
};

type Translate = (key: string) => string;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const CommonText = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(50, 49, 52, 1);
`;

const BoldText = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 18px 1fr;
  column-gap: 10px;
  row-gap: 10px;
`;

const IconCell = styled.div`
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
`;

export const PriceBox = styled.div`
  display: flex;
  gap: 8px;
  align-items: baseline;
`;

export const Price = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const Frequency = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 16px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const getOfflineCoursesArray = (t: Translate): TInteractiveCard[] => [
  {
    id: 1,
    title: t("cards.fromZero.title"),
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 26 }}>
          {t("cards.fromZero.description")}
        </CommonText>

        <Section style={{ marginBottom: 26 }}>
          <Grid>
            <IconCell>
              <SmallClock />
            </IconCell>
            <BoldText>{t("cards.common.schedule")}</BoldText>

            <div />
            <CommonText>{t("cards.fromZero.schedule.1")}</CommonText>

            <div />
            <CommonText>{t("cards.fromZero.schedule.2")}</CommonText>
          </Grid>
        </Section>

        <Section>
          <Grid>
            <IconCell>
              <SmallMap />
            </IconCell>
            <BoldText>{t("cards.common.location")}</BoldText>

            <div />
            <CommonText>{t("cards.common.locationValue")}</CommonText>
          </Grid>
        </Section>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>{t("cards.fromZero.price")}</Price>
        <Frequency>{t("cards.fromZero.priceSuffix")}</Frequency>
      </PriceBox>
    ),
    buttonText: t("cards.common.button"),
    buttonHref: TRIAL_REGISTRATION_FORM_VIEW_URL,
  },
  {
    id: 2,
    title: t("cards.advanced.title"),
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 26 }}>
          {t("cards.advanced.description")}
        </CommonText>

        <Section style={{ marginBottom: 26 }}>
          <Grid>
            <IconCell>
              <SmallClock />
            </IconCell>
            <BoldText>{t("cards.common.schedule")}</BoldText>

            <div />
            <CommonText>{t("cards.advanced.schedule.1")}</CommonText>

            <div />
            <CommonText>{t("cards.advanced.schedule.2")}</CommonText>
          </Grid>
        </Section>

        <Section>
          <Grid>
            <IconCell>
              <SmallMap />
            </IconCell>
            <BoldText>{t("cards.common.location")}</BoldText>

            <div />
            <CommonText>{t("cards.common.locationValue")}</CommonText>
          </Grid>
        </Section>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>{t("cards.advanced.price")}</Price>
        <Frequency>{t("cards.advanced.priceSuffix")}</Frequency>
      </PriceBox>
    ),
    buttonText: t("cards.common.button"),
    buttonHref: TRIAL_REGISTRATION_FORM_VIEW_URL,
  },
  {
    id: 3,
    title: t("cards.impro.title"),
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>
          {t("cards.impro.description")}
        </CommonText>
        <BoldText style={{ marginBottom: 16 }}>{t("cards.impro.note")}</BoldText>
        <CommonText>{t("cards.impro.details")}</CommonText>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>{t("cards.impro.price")}</Price>
        <Frequency>{t("cards.impro.priceSuffix")}</Frequency>
      </PriceBox>
    ),
    buttonText: t("cards.common.button"),
    buttonHref: INSTAGRAM_PROFILE_URL,
  },
];
