import type { ReactNode } from "react";
import styled from "styled-components";

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

const BigText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
`;

const DateBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const getOnlineCoursesArray = (t: Translate): TInteractiveCard[] => [
  {
    id: 1,
    title: t("cards.firstTouch.title"),
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>
          {t("cards.firstTouch.description.1")}
        </CommonText>
        <CommonText style={{ marginBottom: 16 }}>
          {t("cards.firstTouch.description.2")}
        </CommonText>
        <CommonText>{t("cards.firstTouch.description.3")}</CommonText>
      </Content>
    ),
    bottomRowContent: (
      <DateBox>
        <CommonText>{t("cards.firstTouch.startLabel")}</CommonText>
        <BigText>{t("cards.firstTouch.startValue")}</BigText>
      </DateBox>
    ),
    buttonText: t("cards.firstTouch.button"),
    buttonHref: "/online/first-touch",
  },
  {
    id: 2,
    title: t("cards.choreo.title"),
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>
          {t("cards.choreo.description.1")}
        </CommonText>
        <CommonText>{t("cards.choreo.description.2")}</CommonText>
      </Content>
    ),
    bottomRowContent: (
      <DateBox>
        <CommonText>{t("cards.choreo.startLabel")}</CommonText>
        <BigText>{t("cards.choreo.startValue")}</BigText>
      </DateBox>
    ),
    buttonText: t("cards.choreo.button"),
    buttonHref: "/online/choreo",
  },
];
