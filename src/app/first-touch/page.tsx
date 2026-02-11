"use client";

import Image from "next/image";
import { styled } from "styled-components";

import {
  Button,
  Contacts,
  RoadmapContainer,
  TextContentCard,
  VideoPlayer,
} from "@/components";
import { FirstTouchPageBackgroundPhoto, FirstTouchTelegram } from "@/svg";

import { onlineSuggestions } from "./constants";

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
  max-width: 580px;
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

const Subtitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  color: rgba(0, 0, 0, 1);
  margin: 0 0 20px 0;
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
  bottom: 88px;
  right: 10%;
  z-index: 10;
`;

const IconBox = styled.div`
  position: absolute;
  top: 178px;
  right: 1.5%;
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
  gap: 20px;
  width: 100%;
`;

const VideoSection = styled.section`
  display: flex;
  width: 100%;
  padding: 100px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px 100px 0 0;
  margin: 0 0 -1px 0;
`;

const AboutCourseSection = styled.section`
  display: flex;
  width: 100%;
  padding: 50px 100px;
  box-sizing: border-box;
  justify-content: space-between;
  background: rgba(255, 255, 255, 1);
`;

const AboutCourseCards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 600px;
  width: 100%;
`;

const AboutCourseTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  max-width: 420px;
`;

const CourseProgramSection = styled.section`
  display: flex;
  padding: 100px;
  box-sizing: border-box;
  justify-content: space-between;
  width: 100%;
  background: rgba(255, 255, 255, 1);
  gap: 40px;
`;

const CourseProgramTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 568px;
  width: 100%;
`;

const CourseProgramTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 50px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 80px 0;
  color: rgba(0, 0, 0, 1);
`;

const CourseProgramImage = styled(Image)`
  width: 100%;
  max-width: 473px;
  border-radius: 100px;
`;

export const ContactSection = styled.section`
  display: flex;
  padding: 50px 100px 100px;
  margin: 0 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;
`;

const CourseProgramButtonBox = styled.div`
  display: flex;
  margin: 60px 0 0 85px;
  width: 100%;
  max-width: 310px;
`;

export default function FirstTouch() {
  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>Курс “First Touch”</Title>
          <Subtitle>Твое первое прикосновение к Frame Up Strip..</Subtitle>

          <Description>
            <DescriptionParagraph>
              Курс для тех, кто никогда не танцевал, но хочет научиться чувствовать тело,
              уверенность и движение.
            </DescriptionParagraph>
            <DescriptionParagraph>
              Мы будем работать над базовой техникой, стопами, эмоциями и в конце выучим
              вашу первую хореографию.
            </DescriptionParagraph>
          </Description>

          <DateBox>
            <From>Старт курса</From>
            <Date>1 февраля 2026 г.</Date>
          </DateBox>

          <ButtonBox>
            <Button buttonText="Купить за 350 PLN / 80 €" />
            <Button
              buttonText="Программа курса"
              variant="secondary"
              href="#course-program"
            />
          </ButtonBox>
        </TextBox>

        <ImageBox>
          <FirstTouchPageBackgroundPhoto />
        </ImageBox>

        <IconBox>
          <FirstTouchTelegram />
        </IconBox>
      </IntroductionSection>

      <VideoSection>
        <VideoPlayer
          src="/videos/introduction_first_touch.mp4"
          playLabel="Воспроизвести видео"
          poster="/images/first_touch_poster.png"
        />
      </VideoSection>
      <AboutCourseSection>
        <AboutCourseTitle>Что ждет тебя на курсе</AboutCourseTitle>
        <AboutCourseCards>
          {onlineSuggestions.map((suggestion) => (
            <TextContentCard
              key={suggestion.id}
              icon={suggestion.icon}
              title={suggestion.title}
              text={suggestion.text}
            />
          ))}
        </AboutCourseCards>
      </AboutCourseSection>
      <CourseProgramSection id="course-program">
        <CourseProgramTextBox>
          <CourseProgramTitle>Программа курса</CourseProgramTitle>
          <RoadmapContainer />
          <CourseProgramButtonBox>
            <Button buttonText="Купить за 350 PLN / 80 €" />
          </CourseProgramButtonBox>
        </CourseProgramTextBox>
        <CourseProgramImage
          src={"/images/first_touch_program_photo.png"}
          alt="first_touch_program_photo"
          width={473}
          height={709}
        />
      </CourseProgramSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
