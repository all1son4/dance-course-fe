"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { styled } from "styled-components";

import { Button, Contacts, InteractiveCard } from "@/components";
import { OnlinePageBackgroundPhoto, OnlineTelegramBig } from "@/svg";

import { onlineCoursesArray } from "./constants";

const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 814px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
`;

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 450px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;
`;

export const Title = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  & p {
    font-weight: 300;
    font-style: Light;
    font-size: 17px;
    line-height: 150%;
    letter-spacing: 0;
    color: rgba(72, 72, 72, 1);
  }
`;

const Location = styled.p`
  margin: 0 0 40px 0;
`;

const Description = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
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
  bottom: -32px;
  right: 15%;
  z-index: 10;
`;

const IconBox = styled.div`
  position: absolute;
  top: 160px;
  right: 2%;
  z-index: 15;
`;

const CoursesSection = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;
  justify-content: center;
  padding: 100px 50px;

  & > div {
    max-width: 480px;
  }
`;

const StudioDanceSection = styled.section`
  position: relative;
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 100px 50px 0 50px;
  box-sizing: border-box;
  border-radius: 100px 100px 0 0;
  background: rgba(255, 255, 255, 1);
`;

const StudioDanceTextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 550px;
  position: relative;
`;

const StudioDanceTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: rgba(0, 0, 0, 1);
`;

const StudioDanceParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 30px 0;
`;

const StudioDanceParagraph = styled.p`
  font-weight: 300;
  font-style: light;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

const StudioDanceImage = styled(Image)`
  border-radius: 100px;
`;

export const ContactSection = styled.section`
  display: flex;
  padding: 150px 100px 100px;
  margin: 0 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;
`;

export default function Online() {
  const router = useRouter();
  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>Online курсы</Title>
          <Location>В Telegram</Location>
          <Description>
            <DescriptionParagraph>
              Не у всех есть возможность или смелость прийти на занятия в студию — и это
              абсолютно нормально. Танец должен быть в радость, а не в стресс.
            </DescriptionParagraph>
            <DescriptionParagraph>
              Если вы чувствуете, что пока не готовы к офлайну, живёте в другом городе или
              просто хотите начать в комфортной обстановке, у вас есть альтернатива
              занятий на моих онлайн курсах.
            </DescriptionParagraph>
          </Description>
        </TextBox>
        <ImageBox>
          <OnlinePageBackgroundPhoto />
        </ImageBox>
        <IconBox>
          <OnlineTelegramBig />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {onlineCoursesArray.map((course) => (
          <InteractiveCard
            key={course.id}
            title={course.title}
            topRowContent={course.topRowContent}
            bottomRowContent={course.bottomRowContent}
            buttonText={course.buttonText}
            buttonOnClick={() => {}}
          />
        ))}
      </CoursesSection>
      <StudioDanceSection>
        <StudioDanceTextBox>
          <StudioDanceTitle>Танец в студии — это совсем другие ощущения</StudioDanceTitle>
          <StudioDanceParagraphs>
            <StudioDanceParagraph>
              В студии вы чувствуете энергию людей рядом, ловите ритм быстрее и
              раскрываетесь смелее. Каждое движение становится увереннее, когда рядом
              группа, которая поддерживает, вдохновляет и идёт с вами в одном темпе.
            </StudioDanceParagraph>
            <StudioDanceParagraph>
              Офлайн‑занятия помогают прочувствовать тело глубже, прокачать технику и
              получить тот самый эмоциональный заряд, которого не хватает онлайн. Здесь вы
              не просто повторяете движения — вы проживаете танец.
            </StudioDanceParagraph>
            <StudioDanceParagraph>
              Приходите в студию и позвольте себе больше ощущений, свободы и силы.
            </StudioDanceParagraph>
          </StudioDanceParagraphs>
          <Button
            buttonText="Подробнее о группах"
            width="284px"
            onClick={() => router.push("/offline")}
          />
        </StudioDanceTextBox>
        <StudioDanceImage
          src={"/images/online_page_photo.png"}
          width={502}
          height={628}
          alt="online_page_photo"
        />
      </StudioDanceSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
