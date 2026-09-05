import { useState } from "react";

import InteractiveCard from "@/components/cards/InteractiveCard";
import CurrencySwitch from "@/components/other/CurrencySwitch";
import type { SupportedCheckoutCurrency } from "@/constants/sellable-products";

import {
  AdditionalNotification,
  CurrencyBox,
  MoneyTitle,
  Price,
  PriceBox,
  PriceSkeleton,
  SummaryBottomContent,
  SummaryBoxParahraphs,
  SummaryLineSkeleton,
  SummaryTopContent,
} from "./page.styles";

export type CheckoutSummaryCardProps = {
  accessNote: string;
  amountLabel: string;
  currencyLabel: string;
  descriptionParagraphs: Array<{
    key: string;
    text: string;
  }>;
  formattedPrice: string;
  /** Stripe is confirming: the amount it was minted for must not change. */
  isCurrencyLocked?: boolean;
  /** Catalogue still loading: price and plan line show placeholders. */
  isLoading?: boolean;
  isMobile?: boolean;
  isRenewalCheckout: boolean;
  offerSummary: string | null;
  onCurrencyChange: (value: SupportedCheckoutCurrency) => void;
  renewalDescription: string;
  selectedCurrency: SupportedCheckoutCurrency;
  title: string;
};

export const CheckoutSummaryCard = ({
  accessNote,
  amountLabel,
  currencyLabel,
  descriptionParagraphs,
  formattedPrice,
  isCurrencyLocked = false,
  isLoading = false,
  isMobile = false,
  isRenewalCheckout,
  offerSummary,
  onCurrencyChange,
  renewalDescription,
  selectedCurrency,
  title,
}: CheckoutSummaryCardProps) => {
  // The amount only fades when the currency is switched, never on first
  // paint: the initial currency is what the server rendered.
  const [initialCurrency] = useState(selectedCurrency);
  const hasSwitchedCurrency = selectedCurrency !== initialCurrency;
  const topRowContent = (
    <SummaryTopContent>
      <SummaryBoxParahraphs>
        {isRenewalCheckout ? (
          <p>{renewalDescription}</p>
        ) : (
          descriptionParagraphs.map((paragraph) => (
            <p key={paragraph.key}>{paragraph.text}</p>
          ))
        )}
        {isLoading ? (
          <SummaryLineSkeleton aria-hidden />
        ) : offerSummary ? (
          <p>{offerSummary}</p>
        ) : null}
      </SummaryBoxParahraphs>
      <AdditionalNotification>{accessNote}</AdditionalNotification>
    </SummaryTopContent>
  );
  const bottomRowContent = (
    <SummaryBottomContent>
      <CurrencyBox>
        <MoneyTitle>{currencyLabel}</MoneyTitle>
        <CurrencySwitch
          disabled={isCurrencyLocked}
          onChange={onCurrencyChange}
          value={selectedCurrency}
          width="160px"
        />
      </CurrencyBox>
      <PriceBox>
        <MoneyTitle>{amountLabel}</MoneyTitle>
        {isLoading ? (
          <Price aria-busy="true">
            <PriceSkeleton aria-hidden />
          </Price>
        ) : (
          <Price key={selectedCurrency} $isSwapped={hasSwitchedCurrency}>
            {formattedPrice}
          </Price>
        )}
      </PriceBox>
    </SummaryBottomContent>
  );

  return (
    <InteractiveCard
      // Pinned over the scrolling form on mobile, so it needs the real blur.
      frost={isMobile ? "live" : "static"}
      title={title}
      topRowContent={topRowContent}
      bottomRowContent={bottomRowContent}
      isTopRowCollapsible={isMobile || undefined}
      defaultCollapseTopRow={isMobile || undefined}
    />
  );
};
