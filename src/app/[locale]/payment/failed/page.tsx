import { getTranslations } from "next-intl/server";
import styled from "styled-components";

import { Button } from "@/components";
import { glass } from "@/styles/mixins/glass";
import { Failed } from "@/svg";

import FailedPageGuard from "./failed-page-guard";

const CHECKOUT_CONTEXT_KEYS = ["product", "offer", "currency"] as const;
type FailedPageSearchParams = Record<string, string | string[] | undefined>;
type FailedPageProps = {
  searchParams?: Promise<FailedPageSearchParams> | FailedPageSearchParams;
};

const getParamValue = (searchParams: FailedPageSearchParams, key: string): string => {
  const value = searchParams[key];

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return (value[0] ?? "").trim();
  }

  return "";
};

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

export default async function FailedPage({ searchParams }: FailedPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const t = await getTranslations("PaymentFailedPage");
  const contextParams = new URLSearchParams();

  CHECKOUT_CONTEXT_KEYS.forEach((key) => {
    const value = getParamValue(resolvedSearchParams, key);

    if (value) {
      contextParams.set(key, value);
    }
  });

  const paymentPath = contextParams.toString()
    ? `/payment?${contextParams.toString()}`
    : "/payment";

  return (
    <Container>
      <ResultCard>
        <FailedPageGuard />
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
