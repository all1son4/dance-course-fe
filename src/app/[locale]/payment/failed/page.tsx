"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import styled from "styled-components";

import { Button } from "@/components";
import { glass } from "@/styles/mixins/glass";
import { Failed } from "@/svg";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;

const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }
`;

const ResultCard = styled.div`
  display: flex;
  flex-direction: column;
  padding: 60px;
  max-width: 740px;

  ${glass({
    radius: "40px",
  })}

  @media (max-width: 767px) {
    border-radius: 40px !important;
    padding: 30px 20px;
  }
`;

const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 40px 0 20px 0;
  color: rgba(0, 0, 0, 1);
`;

const Paragraps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
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

const ButtonBox = styled.div`
  display: flex;
  justify-content: center;
  margin: 40px 0 0 0;
  max-width: 600px;
  width: 100%;
  gap: 10px;

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;

export default function FailedPage() {
  const searchParams = useSearchParams();
  const t = useTranslations("PaymentFailedPage");
  const contextParams = new URLSearchParams();

  CHECKOUT_CONTEXT_KEYS.forEach((key) => {
    const value = searchParams.get(key)?.trim();

    if (value) {
      contextParams.set(key, value);
    }
  });

  const paymentPath = contextParams.toString()
    ? `/payment?${contextParams.toString()}`
    : "/payment";

  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");

    return () => {
      document.body.removeAttribute("data-hide-footer");
    };
  }, []);

  return (
    <Container>
      <ResultCard>
        <Failed />
        <Title>{t("title")}</Title>
        <Paragraps>
          <Paragraph>{t("description.line1")}</Paragraph>
          <Paragraph>{t("description.line2")}</Paragraph>
          <ButtonBox>
            <Button buttonText={t("buttons.backToPayment")} href={paymentPath} />
            <Button
              buttonText={t("buttons.contactSupport")}
              href="/#contacts"
              variant="secondary"
            />
          </ButtonBox>
        </Paragraps>
      </ResultCard>
    </Container>
  );
}
