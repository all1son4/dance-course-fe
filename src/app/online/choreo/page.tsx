"use client";

import { styled } from "styled-components";

import { Button, Contacts, TextContentCard } from "@/components";
import ChoreoCard from "@/components/cards/ChoreoCard";
import { OnlineChoreoPageBackgroundPhoto, TelegramChoreo } from "@/svg";

import { choreos, onlineSuggestions } from "./contstants";

const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 914px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
`;

const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 540px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;
`;

const Title = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: rgba(0, 0, 0, 1);
`;

const Description = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 60px 0;
`;

const DescriptionParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(12, 12, 12, 1);
`;

const ImageBox = styled.div`
  position: absolute;
  bottom: -70px;
  right: 1.5%;
  z-index: 10;
`;

const IconBox = styled.div`
  position: absolute;
  top: 139px;
  right: 1%;
  z-index: 15;
`;

const DateBox = styled.div`
  display: flex;
  flex-direction: column;
  margin: 0 0 30px 0;
`;

const From = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

const Date = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const ButtonBox = styled.div`
  display: flex;
  width: 100%;
`;

const SpecianWrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  margin: 0 0 100px 0;
  padding: 100px;
  border-radius: 100px;
  // background: linear-gradient(165.84deg, #FFFFFF 1.66%, #E9E9E9 53.89%);
  background: rgba(255, 255, 255, 1);
`;

const AboutChoreoSection = styled.section`
  display: flex;
  width: 100%;
  padding: 0 0 50px 0;
  box-sizing: border-box;
  justify-content: space-between;
`;

const AboutChoreoCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px;
  width: 100%;
`;

const AboutChoreoTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  max-width: 420px;
`;

export const ChoreoSection = styled.section`
  display: flex;
  width: 100%;
  padding: 100px 100px 150px 100px;
  box-sizing: border-box;
  justify-content: center;
  align-items: stretch;
  gap: 30px;

  & > div {
    max-width: 485px;
  }
`;

export default function FirstTouch() {
  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>Видео‑разборы моих хореографий</Title>

          <Description>
            <DescriptionParagraph>
              Онлайн-разборы моих хореографий для тех, кто хочет глубины, структуры и
              выразительного танца.
            </DescriptionParagraph>
            <DescriptionParagraph>
              Учим вместе онлайн: можно пересматривать и повторять столько раз, сколько
              нужно, чтобы уверенно собрать всё в музыку.
            </DescriptionParagraph>
          </Description>

          <DateBox>
            <From>Старт курса</From>
            <Date>В любое время</Date>
          </DateBox>

          <ButtonBox>
            <Button buttonText="Выбрать хореографию" />
          </ButtonBox>
        </TextBox>

        <ImageBox>
          <OnlineChoreoPageBackgroundPhoto />
        </ImageBox>

        <IconBox>
          <TelegramChoreo />
        </IconBox>
      </IntroductionSection>
      <SpecianWrapper>
        <AboutChoreoSection>
          <AboutChoreoTitle>Что ждет тебя на курсе</AboutChoreoTitle>
          <AboutChoreoCards>
            {onlineSuggestions.map((suggestion) => (
              <TextContentCard
                key={suggestion.id}
                icon={suggestion.icon}
                title={suggestion.title}
                text={suggestion.text}
              />
            ))}
          </AboutChoreoCards>
        </AboutChoreoSection>
        <ChoreoSection>
          {choreos.map((choreo) => (
            <ChoreoCard
              key={choreo.id}
              videoSrc={choreo.videoSrc}
              postrSrc={choreo.postrSrc}
              title={choreo.title}
              firstButtonOptions={choreo.firstButtonOptions}
              secondButtonOptions={choreo.secondButtonOptions}
            />
          ))}
        </ChoreoSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </SpecianWrapper>
    </>
  );
}
