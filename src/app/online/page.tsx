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
  padding: 0 25px;
  box-sizing: border-box;
  width: 100%;

  @media (max-width: 1240px) {
    padding: 0 20px;
  }

  @media (max-width: 1140px) {
    min-height: 750px;
  }

  @media (max-width: 920px) {
    min-height: 620px;
    padding: 180px 20px 0;
  }

  @media (max-width: 880px) {
    padding: 180px 20px 20px;
    align-items: flex-start;
  }

  @media (max-width: 767px) {
    padding: 100px 20px 0;
    min-height: unset;
    flex-direction: column;

    & #desktop-only-image-box,
    & #desktop-only-icon-box {
      display: none;
    }
  }
`;

const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 450px;
  position: relative;
  z-index: 15;
  padding: 0 0 0 25px;

  @media (max-width: 1140px) {
    max-width: 400px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
    padding: 0;
  }

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

const Title = styled.h1`
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

  @media (max-width: 920px) {
    font-size: 50px;
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

  @media (max-width: 1140px) {
    right: 10%;
    & svg {
      width: 550px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    right: 7%;
    bottom: -62px;
    & svg {
      width: 400px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    bottom: 0;
  }
`;

const IconBox = styled.div`
  position: absolute;
  top: 160px;
  right: 2%;
  z-index: 15;

  @media (max-width: 1240px) {
    right: 0;
  }

  @media (max-width: 1140px) {
    top: 220px;
    & svg {
      width: 350px;
      height: auto;
    }
  }

  @media (max-width: 920px) {
    top: 200px;
    & svg {
      width: 250px;
      height: auto;
    }
  }
`;

const MobileImagesBox = styled.div`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    position: relative;
    width: 100%;

    & #mobile-only-image-box {
      position: relative;
      display: flex;
      justify-content: flex-start;
      top: unset;
      right: unset;
      bottom: unset;
      width: 100%;
      margin: -150px 0 0 0;
      & svg {
        margin: 0 0 0 -100px;
        width: 100%;
      }
    }

    & #mobile-only-icon-box {
      display: flex;
      justify-content: flex-end;
      top: 10%;
      right: 0;
      width: 100%;

      & svg {
        width: 65%;
      }
    }
  }

  @media (max-width: 550px) {
    & #mobile-only-image-box {
      margin: -120px 0 0 0;
      & svg {
        margin: 0 0 0 -80px;
      }
    }

    & #mobile-only-icon-box {
      & svg {
        width: 62%;
      }
    }
  }

  @media (max-width: 450px) {
    & #mobile-only-image-box {
      margin: -80px 0 0 0;

      & svg {
        margin: 0 0 0 -60px;
      }
    }

    & #mobile-only-icon-box {
      top: 15%;
    }
  }
`;

const CoursesSection = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;
  justify-content: center;
  padding: 100px 0;

  & > div {
    max-width: 480px;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: center;
    & > div {
      max-width: 100%;
    }
  }
`;

const StudioDanceSection = styled.section`
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 40px;
  width: 100%;
  padding: 100px 100px 0;
  box-sizing: border-box;
  border-radius: 100px 100px 0 0;
  background: rgba(255, 255, 255, 1);

  @media (max-width: 1100px) {
    padding: 50px 50px 0;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 0;
    flex-direction: column;
    border-radius: 40px 40px 0 0;
  }
`;

const StudioDanceTextBox = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 550px;
  position: relative;

  @media (max-width: 880px) {
    max-width: 100%;
  }

  @media (max-width: 550px) {
    & button {
      max-width: 100%;
    }
  }
`;

const StudioDanceTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
  }
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
  display: flex;
  width: 100%;
  height: 100%;
  max-width: 502px;

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1024px) {
    max-width: 380px;
  }

  @media (max-width: 880px) {
    max-width: 550px;
    margin: 0 auto;
  }

  @media (max-width: 767px) {
    border-radius: 40px;
  }
`;

const ContactSection = styled.section`
  display: flex;
  padding: 150px 100px 100px;
  margin: 0 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;

  @media (max-width: 1100px) {
    padding: 150px 50px 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    border-radius: 0 0 40px 40px;
    margin: 0 0 60px 0;
  }
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
        <MobileImagesBox>
          <ImageBox id="mobile-only-image-box">
            <OnlinePageBackgroundPhoto />
          </ImageBox>
          <IconBox id="mobile-only-icon-box">
            <OnlineTelegramBig />
          </IconBox>
        </MobileImagesBox>
        <ImageBox id="desktop-only-image-box">
          <OnlinePageBackgroundPhoto />
        </ImageBox>
        <IconBox id="desktop-only-icon-box">
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
            buttonOnClick={() => router.push(course.buttonHref || "")}
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
