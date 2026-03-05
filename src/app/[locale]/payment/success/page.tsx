"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import styled from "styled-components";

import { Button } from "@/components";
import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { glass } from "@/styles/mixins/glass";
import { Success } from "@/svg";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;
const FIRST_TOUCH_TELEGRAM_LINK = "https://t.me/+YSmcfQx7nYhhOTgy";

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
  gap: 10px;
  width: 100%;

  @media (max-width: 767px) {
    max-width: 100%;
  }
`;

export default function SuccesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("PaymentSuccessPage");
  const isFirstTouchPurchase =
    searchParams.get("product")?.trim() === SELLABLE_PRODUCTS["first-touch"].id;

  useEffect(() => {
    document.body.setAttribute("data-hide-footer", "true");

    return () => {
      document.body.removeAttribute("data-hide-footer");
    };
  }, []);

  useEffect(() => {
    const redirectStatus =
      searchParams.get("redirect_status")?.trim().toLowerCase() ?? "";
    const checkoutSessionId = searchParams.get("checkout")?.trim() ?? "";
    const paymentIntentId = searchParams.get("payment_intent")?.trim() ?? "";
    const contextParams = new URLSearchParams();
    CHECKOUT_CONTEXT_KEYS.forEach((key) => {
      const value = searchParams.get(key)?.trim();

      if (value) {
        contextParams.set(key, value);
      }
    });
    const contextQuery = contextParams.toString();
    const failedPath = contextQuery
      ? `/payment/failed?${contextQuery}`
      : "/payment/failed";

    if (redirectStatus === "failed") {
      router.replace(failedPath);
      return;
    }

    if (!paymentIntentId || !checkoutSessionId) {
      return;
    }

    let isDisposed = false;

    const verifyOutcome = async () => {
      try {
        const response = await fetch("/api/stripe/payment-intent/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checkoutSessionId,
            paymentIntentId,
          }),
        });

        if (!response.ok || isDisposed) {
          return;
        }

        const data = (await response.json()) as {
          outcome?:
            | "canceled"
            | "failed"
            | "processing"
            | "requires_action"
            | "succeeded";
        };

        if (data.outcome === "failed" || data.outcome === "canceled") {
          router.replace(failedPath);
        }
      } catch {
        // Keep the success screen if status validation is temporarily unavailable.
      }
    };

    void verifyOutcome();

    return () => {
      isDisposed = true;
    };
  }, [router, searchParams]);

  return (
    <Container>
      <ResultCard>
        <Success />
        <Title>{t("title")}</Title>
        <Paragraps>
          <Paragraph>{t("description.line1")}</Paragraph>
          <Paragraph>{t("description.line2")}</Paragraph>
        </Paragraps>
        <ButtonBox>
          {isFirstTouchPurchase && (
            <Button
              buttonText={t("telegram.openLink")}
              href={FIRST_TOUCH_TELEGRAM_LINK}
              target="_blank"
            />
          )}
          <Button buttonText={t("buttons.home")} href="/" variant="secondary" />
        </ButtonBox>
      </ResultCard>
    </Container>
  );
}
