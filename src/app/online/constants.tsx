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
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
`;

const DateBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

export const onlineCoursesArray: TInteractiveCard[] = [
  {
    id: 1,
    title: `Курс для начинающих “First Touch”`,
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>
          Твое первое прикосновение к Frame Up Strip.
        </CommonText>
        <CommonText style={{ marginBottom: 16 }}>
          Курс для тех, кто никогда не танцевал, но хочет научиться чувствовать тело,
          уверенность и движение.
        </CommonText>
        <CommonText>
          Мы будем работать над базовой техникой, стопами, эмоциями и в конце выучим вашу
          первую хореографию.
        </CommonText>
      </Content>
    ),
    bottomRowContent: (
      <DateBox>
        <CommonText>Старт курса</CommonText>
        <BigText>1 февраля 2026 г.</BigText>
      </DateBox>
    ),
    buttonText: "Подробнее о курсе",
    buttonHref: "/online/first-touch",
  },
  {
    id: 2,
    title: `Видео‑разборы моих хореографий`,
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>
          Онлайн-разборы моих хореографий для тех, кто хочет глубины, структуры и
          выразительного танца.
        </CommonText>
        <CommonText>
          Учим вместе онлайн: можно пересматривать и повторять столько раз, сколько нужно,
          чтобы уверенно собрать всё в музыку.
        </CommonText>
      </Content>
    ),
    bottomRowContent: (
      <DateBox>
        <CommonText>Старт курса</CommonText>
        <BigText>В любое время</BigText>
      </DateBox>
    ),
    buttonText: "Подробнее о курсе",
    buttonHref: "/online/choreo",
  },
];
