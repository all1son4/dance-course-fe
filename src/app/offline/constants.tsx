import type { ReactNode } from "react";
import styled from "styled-components";

import { SmallClock, SmallMap } from "@/svg";

export type TInteractiveCard = {
  id: number;
  title: string;
  topRowContent?: ReactNode;
  bottomRowContent?: ReactNode;
  buttonText?: string;
  buttonOnClick?: () => void;
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

const BoldText = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 100%;
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
  line-height: 100%;
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

export const offlineCoursesArray: TInteractiveCard[] = [
  {
    id: 1,
    title: "From zero",
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 26 }}>
          Идеально, если вы только начинаете. Мы работаем над базовой техникой, пластикой,
          осанкой, чувством ритма и уверенностью в движении.
        </CommonText>

        <Section style={{ marginBottom: 26 }}>
          <Grid>
            <IconCell>
              <SmallClock />
            </IconCell>
            <BoldText>Расписание</BoldText>

            <div />
            <CommonText>Понедельник 20:30–22:00</CommonText>

            <div />
            <CommonText>Пятница 19:00–20:30</CommonText>
          </Grid>
        </Section>

        <Section>
          <Grid>
            <IconCell>
              <SmallMap />
            </IconCell>
            <BoldText>Место проведения</BoldText>

            <div />
            <CommonText>Warsaw, Mikołaja Drygały 5</CommonText>
          </Grid>
        </Section>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>500 PLN</Price>
        <Frequency>/ в месяц</Frequency>
      </PriceBox>
    ),
    buttonText: "Записаться",
  },
  {
    id: 2,
    title: "Advanced",
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 26 }}>
          Для тех, кто стремится к деталям, динамике и глубокому пониманию стиля, хочет
          улучшать музыкальность и работать над выразительностью.
        </CommonText>

        <Section style={{ marginBottom: 26 }}>
          <Grid>
            <IconCell>
              <SmallClock />
            </IconCell>
            <BoldText>Расписание</BoldText>

            <div />
            <CommonText>Понедельник 19:00–20:30</CommonText>

            <div />
            <CommonText>Среда 19:00–20:30</CommonText>
          </Grid>
        </Section>

        <Section>
          <Grid>
            <IconCell>
              <SmallMap />
            </IconCell>
            <BoldText>Место проведения</BoldText>

            <div />
            <CommonText>Warsaw, Mikołaja Drygały 5</CommonText>
          </Grid>
        </Section>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>500 PLN</Price>
        <Frequency>/ в месяц</Frequency>
      </PriceBox>
    ),
    buttonText: "Записаться",
  },
  {
    id: 3,
    title: "Impro room",
    topRowContent: (
      <Content>
        <CommonText style={{ marginBottom: 16 }}>Практики по импровизации.</CommonText>
        <BoldText style={{ marginBottom: 16 }}>
          В этой группе нет определённого расписания.
        </BoldText>
        <CommonText>
          Каждый месяц мы решаем, когда и где встречаемся и практикуем разные упражнения,
          исследуем нюансы, детали, взаимодействие с музыкой и тишиной, создаём
          собственный танцевальный язык.
        </CommonText>
      </Content>
    ),
    bottomRowContent: (
      <PriceBox>
        <Price>50 PLN</Price>
        <Frequency>/ за занятие</Frequency>
      </PriceBox>
    ),
    buttonText: "Записаться",
  },
];
