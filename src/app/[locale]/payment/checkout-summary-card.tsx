import InteractiveCard from "@/components/cards/InteractiveCard";
import CurrencySwitch from "@/components/other/CurrencySwitch";
import type { SupportedCheckoutCurrency } from "@/constants/sellable-products";

import {
  AdditionalNotification,
  CurrencyBox,
  MoneyTitle,
  Price,
  PriceBox,
  SummaryBottomContent,
  SummaryBoxParahraphs,
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
  isMobile = false,
  isRenewalCheckout,
  offerSummary,
  onCurrencyChange,
  renewalDescription,
  selectedCurrency,
  title,
}: CheckoutSummaryCardProps) => {
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
        {offerSummary ? <p>{offerSummary}</p> : null}
      </SummaryBoxParahraphs>
      <AdditionalNotification>{accessNote}</AdditionalNotification>
    </SummaryTopContent>
  );
  const bottomRowContent = (
    <SummaryBottomContent>
      <CurrencyBox>
        <MoneyTitle>{currencyLabel}</MoneyTitle>
        <CurrencySwitch
          onChange={onCurrencyChange}
          value={selectedCurrency}
          width="160px"
        />
      </CurrencyBox>
      <PriceBox>
        <MoneyTitle>{amountLabel}</MoneyTitle>
        <Price>{formattedPrice}</Price>
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
