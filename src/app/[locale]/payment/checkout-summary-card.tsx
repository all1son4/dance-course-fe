import { useEffect, useId, useRef, useState } from "react";

import CurrencySwitch from "@/components/other/CurrencySwitch";
import type { SupportedCheckoutCurrency } from "@/constants/sellable-products";

import {
  CheckoutProgressFill,
  CheckoutProgressTrack,
  CurrencyBox,
  MoneyTitle,
  Price,
  PriceBox,
  PriceSkeleton,
  SummaryBar,
  SummaryBarChevron,
  SummaryBarDropdown,
  SummaryBarHead,
  SummaryBarPanel,
  SummaryBarPrice,
  SummaryBarStep,
  SummaryBarTitle,
  SummaryBottomContent,
  SummaryBoxParahraphs,
  SummaryCard,
  SummaryCardBody,
  SummaryCardHead,
  SummaryEyebrow,
  SummaryIncludes,
  SummaryLineSkeleton,
  SummarySupport,
  SummaryTitle,
} from "./page.styles";

export type CheckoutSummaryCardProps = {
  amountLabel: string;
  currencyLabel: string;
  descriptionParagraphs: Array<{
    key: string;
    text: string;
  }>;
  eyebrow: string;
  formattedPrice: string;
  /** What the purchase gives, one short line each (term, format, access). */
  includes: string[];
  /** Stripe is confirming: the amount it was minted for must not change. */
  isCurrencyLocked?: boolean;
  /** Catalogue still loading: price and plan line show placeholders. */
  isLoading?: boolean;
  isRenewalCheckout: boolean;
  offerSummary: string | null;
  onCurrencyChange: (value: SupportedCheckoutCurrency) => void;
  renewalDescription: string;
  selectedCurrency: SupportedCheckoutCurrency;
  support: { href: string; label: string; title: string };
  title: string;
};

const TelegramIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M20.6 4.4 3.9 10.9c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.6 5c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.1-2 4.4 3.2c.8.4 1.3.2 1.5-.8l2.7-12.7c.3-1.2-.4-1.7-1.4-1.2Z"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

/** Description, the "what you get" list and the support line: shared by the card and the phone bar. */
const SummaryDetails = ({
  descriptionParagraphs,
  includes,
  isLoading,
  isRenewalCheckout,
  offerSummary,
  renewalDescription,
}: Pick<
  CheckoutSummaryCardProps,
  | "descriptionParagraphs"
  | "includes"
  | "isLoading"
  | "isRenewalCheckout"
  | "offerSummary"
  | "renewalDescription"
>) => (
  <>
    <SummaryBoxParahraphs>
      {isRenewalCheckout ? (
        <p>{renewalDescription}</p>
      ) : (
        descriptionParagraphs.map((paragraph) => (
          <p key={paragraph.key}>{paragraph.text}</p>
        ))
      )}
    </SummaryBoxParahraphs>
    <SummaryIncludes>
      {isLoading ? (
        <li aria-hidden="true">
          <SummaryLineSkeleton />
        </li>
      ) : offerSummary ? (
        <li>{offerSummary}</li>
      ) : null}
      {includes.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </SummaryIncludes>
  </>
);

const SummaryPrice = ({
  amountLabel,
  currencyLabel,
  formattedPrice,
  isCurrencyLocked,
  isLoading,
  onCurrencyChange,
  selectedCurrency,
}: Pick<
  CheckoutSummaryCardProps,
  | "amountLabel"
  | "currencyLabel"
  | "formattedPrice"
  | "isCurrencyLocked"
  | "isLoading"
  | "onCurrencyChange"
  | "selectedCurrency"
>) => {
  // The amount only fades when the currency is switched, never on first
  // paint: the initial currency is what the server rendered.
  const [initialCurrency] = useState(selectedCurrency);
  const hasSwitchedCurrency = selectedCurrency !== initialCurrency;

  return (
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
};

const SummarySupportLink = ({ support }: Pick<CheckoutSummaryCardProps, "support">) => (
  <SummarySupport href={support.href} rel="noopener noreferrer" target="_blank">
    <TelegramIcon />
    <span>
      <b>{support.title}</b>
      {support.label}
    </span>
  </SummarySupport>
);

/** The purchase column on wide screens: what is bought, what it gives, what it costs. */
export const CheckoutSummaryCard = (props: CheckoutSummaryCardProps) => (
  <SummaryCard>
    <SummaryCardHead>
      {props.eyebrow ? <SummaryEyebrow>{props.eyebrow}</SummaryEyebrow> : null}
      <SummaryTitle>{props.title}</SummaryTitle>
    </SummaryCardHead>
    <SummaryCardBody>
      <SummaryDetails {...props} />
      <SummaryPrice {...props} />
      <SummarySupportLink support={props.support} />
    </SummaryCardBody>
  </SummaryCard>
);

/**
 * The same purchase on phones and tablets: one slim line (title, step, price)
 * that stays pinned under the header and opens into the full details. The
 * pinned card it replaces covered close to half of a 375x812 screen.
 */
export const CheckoutSummaryBar = ({
  progressRatio,
  stepText,
  ...props
}: CheckoutSummaryCardProps & { progressRatio: number; stepText: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const barRef = useRef<HTMLDivElement>(null);

  // The details float over the form: a tap anywhere else or Escape puts them away.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <SummaryBar ref={barRef}>
      <SummaryBarHead
        aria-controls={panelId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        type="button"
      >
        <span>
          <SummaryBarTitle>{props.title}</SummaryBarTitle>
          <SummaryBarStep>
            {stepText}
            <CheckoutProgressTrack aria-hidden="true" $width="56px">
              <CheckoutProgressFill style={{ transform: `scaleX(${progressRatio})` }} />
            </CheckoutProgressTrack>
          </SummaryBarStep>
        </span>
        <SummaryBarPrice aria-busy={props.isLoading || undefined}>
          {props.isLoading ? <PriceSkeleton aria-hidden /> : props.formattedPrice}
        </SummaryBarPrice>
        <SummaryBarChevron aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </SummaryBarChevron>
      </SummaryBarHead>
      <SummaryBarDropdown $isOpen={isOpen} id={panelId} inert={!isOpen}>
        <SummaryBarPanel>
          <SummaryDetails {...props} />
          <SummaryPrice {...props} />
          <SummarySupportLink support={props.support} />
        </SummaryBarPanel>
      </SummaryBarDropdown>
    </SummaryBar>
  );
};
