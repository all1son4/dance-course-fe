import { getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { Failed } from "@/svg";

import {
  ResultButtonBox,
  ResultCard,
  ResultContainer,
  ResultParagraph,
  ResultParagraphs,
  ResultTitle,
} from "../result-page.styles";
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
    <ResultContainer>
      <ResultCard>
        <FailedPageGuard />
        <Failed />
        <ResultTitle>{t("title")}</ResultTitle>
        <ResultParagraphs>
          <ResultParagraph>{t("description.line1")}</ResultParagraph>
          <ResultParagraph>{t("description.line2")}</ResultParagraph>
          <ResultButtonBox>
            <Button buttonText={t("buttons.backToPayment")} href={paymentPath} />
            <Button
              buttonText={t("buttons.contactSupport")}
              href={SUPPORT_TELEGRAM_URL}
              target="_blank"
              variant="secondary"
            />
          </ResultButtonBox>
        </ResultParagraphs>
      </ResultCard>
    </ResultContainer>
  );
}
