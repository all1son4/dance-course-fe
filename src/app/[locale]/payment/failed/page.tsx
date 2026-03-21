import { getTranslations } from "next-intl/server";

import { Button } from "@/components";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { Failed } from "@/svg";

import FailedPageGuard from "./failed-page-guard";
import {
  ButtonBox,
  Container,
  Paragraph,
  Paragraphs,
  ResultCard,
  Title,
} from "./page.styles";

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
        <Paragraphs>
          <Paragraph>{t("description.line1")}</Paragraph>
          <Paragraph>{t("description.line2")}</Paragraph>
          <ButtonBox>
            <Button buttonText={t("buttons.backToPayment")} href={paymentPath} />
            <Button
              buttonText={t("buttons.contactSupport")}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
              variant="secondary"
            />
          </ButtonBox>
        </Paragraphs>
      </ResultCard>
    </Container>
  );
}
