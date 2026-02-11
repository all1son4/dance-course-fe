"use client";

import { useRouter } from "next/navigation";
import { styled } from "styled-components";

import { Contacts, CourseCard, InteractiveCard } from "@/components";
import { OfflinePageBackgroundPhoto, TelegramGlass, WarsawMap } from "@/svg";

import { offlineCoursesArray } from "./constants";

const IntroductionSection = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 760px;
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

const Description = styled.p`
  margin: 0;
`;

const ImageBox = styled.div`
  position: absolute;
  top: 88px;
  right: 14%;
  z-index: 10;
`;

const IconBox = styled.div`
  position: absolute;
  bottom: 20px;
  right: 4%;
  z-index: 15;
`;

const CoursesSection = styled.section`
  display: flex;
  align-items: stretch;
  width: 100%;
  padding: 100px 50px;
  gap: 20px;
  box-sizing: border-box;
`;

const PromoteOnlineSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  box-sizing: border-box;
  position: relative;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px 100px 0 0;
`;

const CourseList = styled.ul`
  list-style: numeric;
  padding: 0 0 0 16px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: #000000;

  & li {
    margin: 0;
  }
`;

const TextBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  max-width: 560px;
`;

const CardBlock = styled.div`
  display: flex;
  width: 100%;
  max-width: 460px;
`;

const PromoteTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

const Paragraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const ContactSection = styled.section`
  display: flex;
  padding: 50px 100px 100px;
  margin: 0 0 100px 0;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 1);
  border-radius: 0 0 100px 100px;
`;

export default function Offline() {
  const router = useRouter();
  return (
    <>
      <IntroductionSection>
        <TextBox>
          <Title>Offline курсы</Title>
          <Location>Warsaw, Poland</Location>
          <Description>
            Каждый приходит в Frame Up со своей историей — кто‑то впервые встаёт на
            каблуки, а кто‑то уже уверенно танцует и хочет расти дальше. Поэтому занятия
            разделены на уровни, чтобы вы могли развиваться комфортно и без стресса.
          </Description>
        </TextBox>
        <ImageBox>
          <OfflinePageBackgroundPhoto />
        </ImageBox>
        <IconBox>
          <WarsawMap />
        </IconBox>
      </IntroductionSection>
      <CoursesSection>
        {offlineCoursesArray.map((course) => (
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
      <PromoteOnlineSection>
        <TextBlock>
          <PromoteTitle>Не можете посещать офлайн‑занятия?</PromoteTitle>
          <Paragraphs>
            <Paragraph>
              Не у всех есть возможность или смелость прийти на занятия в студию — и это
              абсолютно нормально. Танец должен быть в радость, а не в стресс.
            </Paragraph>
            <Paragraph>
              Если вы чувствуете, что пока не готовы к офлайну, живёте в другом городе или
              просто хотите начать в комфортной обстановке, у вас есть альтернатива
              занятий на моих онлайн курсах.
            </Paragraph>
          </Paragraphs>
        </TextBlock>
        <CardBlock>
          <CourseCard
            icon={<TelegramGlass width={115} height={130} />}
            title="Online курсы"
            subtitle="В TelegramGlass"
            cardContent={
              <CourseList>
                <li>
                  Курс для начинающих{" "}
                  <span style={{ fontWeight: 600 }}>&quot;First Touch&quot;</span>
                </li>
                <li>Разборы хореографий</li>
              </CourseList>
            }
            onClick={() => router.push("/online")}
            bgColor="rgba(200, 204, 210, 0.4)"
          />
        </CardBlock>
      </PromoteOnlineSection>
      <ContactSection>
        <Contacts bgColor="rgba(200, 204, 210, 0.4)" />
      </ContactSection>
    </>
  );
}
