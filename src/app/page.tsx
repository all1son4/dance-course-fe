"use client";

import { useRouter } from "next/navigation";
import { styled } from "styled-components";

import { Button, ContactCard, Contacts, CourseCard, FAQ } from "@/components";
import { glass } from "@/styles/mixins/glass";
import { Insta, Logo, Map, Quote, TelegramGlass } from "@/svg";
import { MainPageBackgroundPhoto } from "@/svg/MainPageBackgroundPhoto";

const IntroduceSection = styled.section`
  position: relative;
  width: 100%;
  min-height: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;

  @media (max-width: 1440px) {
    padding: 0 20px;
  }

  @media (max-width: 1240px) {
    min-height: 750px;
    padding: 0 20px 0 30px;
  }

  @media (max-width: 920px) {
    padding: 10px 20px 0;
    min-height: 600px;
  }

  @media (max-width: 767px) {
    min-height: unset;
    flex-direction: column-reverse;
    padding: 16px 20px 60px;
  }
`;

const AbsolutePageImage = styled.div`
  position: absolute;
  top: 0;
  left: 34%;
  z-index: 20;

  @media (max-width: 1440px) {
    width: 52%;
  }

  @media (max-width: 1240px) {
    display: none;
  }
`;

const AbsolutePageLogo = styled.div`
  position: relative;
  z-index: 25;

  & svg:first-of-type {
    display: none;
  }

  @media (max-width: 1240px) {
    display: flex;
    flex-direction: column-reverse;
    & svg:first-of-type {
      position: relative;
      display: flex;
      height: 750px;
      max-width: 550px;
    }

    & svg:last-of-type {
      display: none;
    }
  }

  @media (max-width: 1110px) {
    & svg:first-of-type {
      position: relative;
      max-width: 480px;
    }
  }

  @media (max-width: 920px) {
    & svg:first-of-type {
      height: 600px;
      max-width: 420px;
    }
  }

  @media (max-width: 767px) {
    & svg:first-of-type {
      height: auto;
      max-width: 65%;
      margin: 0 auto;
    }
  }

  @media (max-width: 680px) {
    & svg:first-of-type {
      max-width: 80%;
    }
  }

  @media (max-width: 450px) {
    & svg:first-of-type {
      max-width: 100%;
    }
  }
`;

const MainTextBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  z-index: 25;
  max-width: 450px;

  @media (max-width: 920px) {
    max-width: 300px;
  }

  @media (max-width: 767px) {
     max-width: 100%;
    }
  }
`;

const MainTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 90px;
  line-height: 130%;
  letter-spacing: 0;
  margin: 0 0 20px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 920px) {
    font-size: 50px;
  }
`;

const DescriptionBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  margin: 0 0 40px 0;
  box-sizing: border-box;

  @media (max-width: 920px) {
    margin: 0 0 20px 0;
  }
`;

const DescriptionTitle = styled.p`
  font-weight: 600;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
`;

const DescriptionText = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InteractiveHint = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const ButtonsBox = styled.div`
  display: flex;
  gap: 20px;

  @media (max-width: 450px) {
    flex-direction: column;
    gap: 15px;
  }
`;

const AboutMeSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px;
  gap: 20px;

  @media (max-width: 1100px) {
    padding: 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    flex-direction: column;
    border-radius: 40px;
    gap: 40px;
  }
`;

const AboutMeTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 505px;
  align-items: flex-start;

  @media (max-width: 1240px) {
    max-width: 420px;
  }

  @media (max-width: 1110px) {
    max-width: 340px;
  }

  @media (max-width: 880px) {
    max-width: 100%;
  }
`;

const AboutMeTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: #000000;

  @media (max-width: 880px) {
    font-size: 40px;
    margin: 0 0 30px 0;
  }
`;

const AboutMeParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  margin: 40px 0 30px 0;

  @media (max-width: 880px) {
    margin: 30px 0;
  }
`;

const AboutMeParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0 0 14px 0;
  color: rgba(0, 0, 0, 1);

  &:last-of-type {
    margin: 0;
  }
`;

const AboutMeList = styled.ul`
  list-style: disc;
  padding-left: 22px;
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

  & > li {
    & a {
      text-underline-offset: 2px;
      text-decoration: underline;
      transition: all 0.2s ease;

      &:hover {
        color: rgba(124, 0, 2, 1);
      }
    }
    margin: 0;
  }
`;

const AboutMeImageBox = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  max-width: 560px;

  @media (max-width: 880px) {
    margin: 0 auto;
  }
`;

const StyledImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 100px;
  object-fit: cover;

  @media (max-width: 767px) {
    border-radius: 40px;
  }
`;

const ImageDescriptionBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const IconPositionWrap = styled.div`
  position: absolute;
  z-index: 10;
  left: -36px;
  top: -120px;

  @media (max-width: 1240px) {
    left: 60px;
    top: -135px;
  }

  @media (max-width: 1240px) {
    left: 30px;
    top: -220px;

    & svg {
      width: 50px;
      height: auto;
    }
  }

  @media (max-width: 450px) {
    top: -180px;
  }
`;

const ImageDescriptionCard = styled.div`
  padding: 60px;
  max-width: 590px;
  width: 100%;
  margin: -86px 0 0 -98px;

  ${glass({
    radius: "100px",
    bgParam: "rgba(228, 228, 228, 0.4)",
  })}

  @media (max-width: 1240px) {
    margin: -106px 0 0 0;
  }

  @media (max-width: 767px) {
    padding: 30px;
    margin: -200px 0 0 0;
    border-radius: 40px !important;
  }

  @media (max-width: 450px) {
    margin: -160px 0 0 0;
    & p {
      font-size: 15px;
    }
  }
`;

const CourseSection = styled.section`
  padding: 100px 50px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 80px;

  @media (max-width: 1240px) {
    padding: 100px 0;
  }

  @media (max-width: 1024px) {
    padding: 100px 20px;
  }

  @media (max-width: 880px) {
    padding: 60px 20px;
    gap: 30px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    gap: 30px;
  }
`;

const CourseTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

const CourseOptionsBox = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;

  @media (max-width: 1100px) {
    & .courseCardContainer {
      padding: 40px;
      min-width: unset;
      max-width: 100%;
    }
    gap: 20px;

    & > .courseCardContainer:first-of-type .courseCardIconBox {
      top: -30px;
      right: 30px;
      & svg {
        width: 76px;
        height: 122px;
      }
    }

    & > .courseCardContainer:last-of-type .courseCardIconBox {
      top: -24px;
      right: 3px;
      & svg {
        width: 94px;
        height: 104px;
      }
    }
  }

  @media (max-width: 880px) {
    & .courseCardContainer {
      border-radius: 40px;
    }
  }

  @media (max-width: 767px) {
    & .courseCardContainer {
      padding: 30px;
      gap: 30px;
    }

    .courseCardTitle {
      font-size: 28px;
    }
    & .courseCardButton {
      max-width: 100%;
    }
  }

  @media (max-width: 680px) {
    flex-direction: column;
    gap: 40px;
  }
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

const FAQSection = styled.section`
  padding: 50px 50px 100px;
  display: flex;

  @media (max-width: 1240px) {
    padding: 50px 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 50px 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px 60px;
  }

  @media (max-width: 680px) {
    padding: 40px 20px;
  }
`;

const ContactSection = styled.section`
  padding: 0 50px 100px;

  @media (max-width: 1240px) {
    padding: 0 0 100px;
  }

  @media (max-width: 1024px) {
    padding: 0 20px 100px;
  }

  @media (max-width: 880px) {
    padding: 0 20px 60px;
  }
`;

export default function Home() {
  const router = useRouter();
  return (
    <>
      <IntroduceSection>
        <AbsolutePageImage>
          <MainPageBackgroundPhoto />
        </AbsolutePageImage>
        <MainTextBox>
          <MainTitle>Frame Up</MainTitle>
          <DescriptionBox>
            <DescriptionTitle>Раскрой себя в стиле frame up</DescriptionTitle>
            <DescriptionText>
              Учись танцевать красиво, смело и чувственно,в атмосфере полной свободы и
              женской силы
            </DescriptionText>
          </DescriptionBox>
          <InteractiveBox>
            <InteractiveHint>Выбирайте свой формат обучения</InteractiveHint>
            <ButtonsBox>
              <Button buttonText="Online" onClick={() => router.push("/online")} />
              <Button buttonText="Offline" onClick={() => router.push("/offline")} />
            </ButtonsBox>
          </InteractiveBox>
        </MainTextBox>
        <AbsolutePageLogo>
          <MainPageBackgroundPhoto />
          <Logo width={350} height={77} />
        </AbsolutePageLogo>
      </IntroduceSection>
      <AboutMeSection>
        <AboutMeTextBox>
          <AboutMeTitle>Обо мне</AboutMeTitle>
          <ContactCard
            icon={<Insta />}
            title="Instagram"
            text="anna.strok_dance"
            link="https://www.instagram.com/anna.strok_dance"
          />
          <AboutMeParagraphs>
            <AboutMeParagraph>
              Я Анна Строк, профессиональная танцовщица и преподаватель с многолетним
              опытом преподавания и четким художественным стилем.
            </AboutMeParagraph>
            <AboutMeParagraph>
              Я являюсь создателем и организатором Total Strip Weekend в Минске —
              крупнейшего в Беларуси чемпионата по frame up strip и high heels, который
              собирал сотни танцоров и стал важным событием в танцевальном сообществе.
            </AboutMeParagraph>
          </AboutMeParagraphs>

          <AboutMeList>
            <li>
              2-е место Frame Solo Pro на{" "}
              <a
                href="https://www.instagram.com/stage__18?igsh=eDF3YTU1a3Z1d3pt"
                target="_blank"
              >
                @stage_18
              </a>{" "}
              в Праге.
            </li>
            <li>
              2-е место Frame Up Team на{" "}
              <a
                href="https://www.instagram.com/stage__18?igsh=eDF3YTU1a3Z1d3pt"
                target="_blank"
              >
                @stage_18
              </a>{" "}
              в Праге.
            </li>
            <li>
              Топ 10 Team на{" "}
              <a
                href="https://www.instagram.com/worldofdancepoland?igsh=MWtsMWo5cmxyYWd3dQ=="
                target="_blank"
              >
                @worldofdancepoland
              </a>{" "}
              в Кракове.
            </li>
            <li>
              Гран-при Solo на{" "}
              <a
                href="https://www.instagram.com/dib.gala?igsh=MWZ3eXgwYnFrMWU2dA=="
                target="_blank"
              >
                @dib.gala
              </a>
            </li>
          </AboutMeList>
        </AboutMeTextBox>
        <AboutMeImageBox>
          <StyledImage
            src={"/images/main_page_second.png"}
            alt="About Me"
            width={560}
            height={635}
          />
          <ImageDescriptionBox>
            <IconPositionWrap>
              <Quote />
            </IconPositionWrap>
            <ImageDescriptionCard>
              <AboutMeParagraph>
                Сегодня я развиваю Frame Up в Польше: веду группы, где женщины
                раскрываются через движение, и продолжаю учиться у европейских мастеров,
                чтобы расти вместе со своими ученицами.
              </AboutMeParagraph>
              <AboutMeParagraph>
                Моя цель — укреплять культуру Frame Up и вдохновлять женщин на смелость,
                свободу и самовыражение, создавая пространство, где каждая может
                почувствовать свою силу, красоту и творческую энергию.
              </AboutMeParagraph>
            </ImageDescriptionCard>
          </ImageDescriptionBox>
        </AboutMeImageBox>
      </AboutMeSection>
      <CourseSection>
        <CourseTitle>Курсы</CourseTitle>
        <CourseOptionsBox>
          <CourseCard
            icon={<Map />}
            title="Offline курсы"
            subtitle="Warsaw, Poland"
            cardContent={
              <CourseList>
                <li>
                  <span style={{ fontWeight: 600 }}>From zero</span> — для начинающих
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>Advanced group</span> — для среднего
                  уровня
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>Impro room</span> — практики по
                  импровизации
                </li>
              </CourseList>
            }
            onClick={() => router.push("/offline")}
          />
          <CourseCard
            icon={<TelegramGlass />}
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
          />
        </CourseOptionsBox>
      </CourseSection>
      <FAQSection>
        <FAQ />
      </FAQSection>
      <ContactSection>
        <Contacts />
      </ContactSection>
    </>
  );
}
