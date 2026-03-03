import { makeAutoObservable, runInAction } from "mobx";
import { ValidationError } from "yup";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
  normalizeTelegramNickname,
  PAYMENT_INPUTS,
  type PaymentAgreementFieldName,
  type PaymentAgreementState,
  type PaymentCustomerData,
  type PaymentCustomerFieldName,
} from "@/app/[locale]/payment/payment.constants";
import { paymentCustomerSchema } from "@/app/[locale]/payment/payment.validation";
import {
  DEFAULT_CHECKOUT_CURRENCY,
  DEFAULT_CHECKOUT_PRODUCT,
  getDefaultProductOffer,
  getProductPrice,
  getResolvedCheckoutCurrency,
  getSellableProductById,
  getSellableProductOfferById,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";

type PaymentCustomerErrors = Partial<Record<PaymentCustomerFieldName, string>>;
type PaymentCustomerTouched = Partial<Record<PaymentCustomerFieldName, boolean>>;
type StripeClientSecrets = Partial<Record<SupportedCheckoutCurrency, string>>;
type StripeIntentErrors = Partial<
  Record<SupportedCheckoutCurrency, StripeIntentErrorCode | null>
>;
type StripeIntentErrorCode =
  | "missing_client_secret"
  | "missing_secret_key"
  | "payment_intent_failed"
  | "payment_intent_request_failed";

export class PaymentStore {
  customerData: PaymentCustomerData = { ...INITIAL_CUSTOMER_DATA };
  customerErrors: PaymentCustomerErrors = {};
  touchedFields: PaymentCustomerTouched = {};
  agreements: PaymentAgreementState = { ...INITIAL_AGREEMENTS };
  selectedCurrency: SupportedCheckoutCurrency = DEFAULT_CHECKOUT_CURRENCY;
  selectedOfferId = DEFAULT_CHECKOUT_PRODUCT.defaultOfferId;
  selectedProductId = DEFAULT_CHECKOUT_PRODUCT.id;
  checkoutCurrencyInitialized = false;
  stripeClientSecrets: StripeClientSecrets = {};
  stripeIntentErrors: StripeIntentErrors = {};
  pendingStripeCurrencies = new Set<SupportedCheckoutCurrency>();

  constructor() {
    makeAutoObservable(
      this,
      {
        pendingStripeCurrencies: false,
      },
      { autoBind: true },
    );
  }

  get areAllAgreementsAccepted() {
    return Object.values(this.agreements).every(Boolean);
  }

  get isCustomerDataValid() {
    return paymentCustomerSchema.isValidSync(this.customerData);
  }

  get canShowStripe() {
    return this.areAllAgreementsAccepted && this.isCustomerDataValid;
  }

  get selectedProduct() {
    return getSellableProductById(this.selectedProductId) ?? DEFAULT_CHECKOUT_PRODUCT;
  }

  get selectedOffer() {
    return (
      getSellableProductOfferById(this.selectedProduct, this.selectedOfferId) ??
      getDefaultProductOffer(this.selectedProduct)
    );
  }

  get selectedPrice() {
    return getProductPrice(
      this.selectedProduct,
      this.selectedOffer.id,
      this.selectedCurrency,
    );
  }

  get stripeClientSecret() {
    return this.getStripeClientSecret(this.selectedCurrency);
  }

  get stripeIntentError() {
    return this.getStripeIntentError(this.selectedCurrency);
  }

  configureCheckoutSelection({
    offerId,
    productId,
  }: {
    offerId?: string | null;
    productId?: string | null;
  }) {
    const nextProduct = getSellableProductById(productId) ?? DEFAULT_CHECKOUT_PRODUCT;
    const nextOffer =
      getSellableProductOfferById(nextProduct, offerId) ??
      getDefaultProductOffer(nextProduct);
    const hasSelectionChanged =
      nextProduct.id !== this.selectedProductId || nextOffer.id !== this.selectedOfferId;

    if (!hasSelectionChanged) {
      return;
    }

    this.selectedProductId = nextProduct.id;
    this.selectedOfferId = nextOffer.id;
    this.clearStripeIntentState();
  }

  initializeCheckoutCurrency(currency: SupportedCheckoutCurrency) {
    if (this.checkoutCurrencyInitialized) {
      return;
    }

    this.selectedCurrency = getResolvedCheckoutCurrency(currency);
    this.checkoutCurrencyInitialized = true;
  }

  setSelectedCurrency(currency: SupportedCheckoutCurrency) {
    const nextCurrency = getResolvedCheckoutCurrency(currency);

    this.checkoutCurrencyInitialized = true;

    if (nextCurrency === this.selectedCurrency) {
      return;
    }

    this.selectedCurrency = nextCurrency;
  }

  setCustomerField(fieldName: PaymentCustomerFieldName, value: string) {
    this.customerData[fieldName] =
      fieldName === "nickname" ? normalizeTelegramNickname(value) : value;

    if (this.touchedFields[fieldName]) {
      this.validateCustomerField(fieldName);
    }
  }

  touchCustomerField(fieldName: PaymentCustomerFieldName) {
    this.touchedFields[fieldName] = true;
    this.validateCustomerField(fieldName);
  }

  setAgreement(fieldName: PaymentAgreementFieldName, checked: boolean) {
    this.agreements[fieldName] = checked;
  }

  getStripeClientSecret(currency: SupportedCheckoutCurrency) {
    const resolvedCurrency = getResolvedCheckoutCurrency(currency);

    return this.stripeClientSecrets[resolvedCurrency] ?? "";
  }

  getStripeIntentError(currency: SupportedCheckoutCurrency) {
    const resolvedCurrency = getResolvedCheckoutCurrency(currency);

    return this.stripeIntentErrors[resolvedCurrency] ?? null;
  }

  async ensureStripePaymentIntent(
    currency: SupportedCheckoutCurrency = this.selectedCurrency,
  ) {
    const resolvedCurrency = getResolvedCheckoutCurrency(currency);

    if (
      !this.canShowStripe ||
      this.getStripeClientSecret(resolvedCurrency) ||
      this.pendingStripeCurrencies.has(resolvedCurrency)
    ) {
      return;
    }

    this.pendingStripeCurrencies.add(resolvedCurrency);
    this.setStripeIntentError(resolvedCurrency, null);

    try {
      const response = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerData: this.customerData,
          currency: resolvedCurrency,
          offerId: this.selectedOffer.id,
          productId: this.selectedProduct.id,
        }),
      });

      const data = (await response.json()) as {
        clientSecret?: string;
        errorCode?: StripeIntentErrorCode;
      };

      if (!response.ok) {
        throw new Error(data.errorCode ?? "payment_intent_request_failed");
      }

      if (!data.clientSecret) {
        throw new Error("missing_client_secret");
      }

      runInAction(() => {
        this.stripeClientSecrets = {
          ...this.stripeClientSecrets,
          [resolvedCurrency]: data.clientSecret ?? "",
        };
        this.setStripeIntentError(resolvedCurrency, null);
      });
    } catch (error) {
      runInAction(() => {
        const errorCode =
          error instanceof Error
            ? (error.message as StripeIntentErrorCode)
            : "payment_intent_request_failed";

        this.stripeClientSecrets = {
          ...this.stripeClientSecrets,
          [resolvedCurrency]: "",
        };
        this.setStripeIntentError(resolvedCurrency, errorCode);
      });
    } finally {
      this.pendingStripeCurrencies.delete(resolvedCurrency);
    }
  }

  validateCustomerField(fieldName: PaymentCustomerFieldName) {
    try {
      paymentCustomerSchema.validateSyncAt(fieldName, this.customerData);
      this.clearFieldError(fieldName);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.customerErrors[fieldName] = error.message;
        return;
      }

      throw error;
    }
  }

  validateCustomerForm() {
    this.markAllFieldsTouched();

    try {
      paymentCustomerSchema.validateSync(this.customerData, {
        abortEarly: false,
      });
      this.customerErrors = {};
    } catch (error) {
      if (error instanceof ValidationError) {
        const nextErrors: PaymentCustomerErrors = {};
        const validationErrors = error.inner.length > 0 ? error.inner : [error];

        validationErrors.forEach((validationError) => {
          const path = validationError.path as PaymentCustomerFieldName | undefined;

          if (path && !nextErrors[path]) {
            nextErrors[path] = validationError.message;
          }
        });

        this.customerErrors = nextErrors;
        return;
      }

      throw error;
    }
  }

  resetCheckoutForm() {
    this.customerData = { ...INITIAL_CUSTOMER_DATA };
    this.customerErrors = {};
    this.touchedFields = {};
    this.agreements = { ...INITIAL_AGREEMENTS };
    this.clearStripeIntentState();
  }

  clearStripeIntentState() {
    this.stripeClientSecrets = {};
    this.stripeIntentErrors = {};
    this.pendingStripeCurrencies.clear();
  }

  private clearFieldError(fieldName: PaymentCustomerFieldName) {
    if (!this.customerErrors[fieldName]) {
      return;
    }

    const nextErrors = { ...this.customerErrors };
    delete nextErrors[fieldName];
    this.customerErrors = nextErrors;
  }

  private markAllFieldsTouched() {
    this.touchedFields = PAYMENT_INPUTS.reduce(
      (acc, field) => {
        acc[field.name] = true;
        return acc;
      },
      {} as Record<PaymentCustomerFieldName, boolean>,
    );
  }

  private setStripeIntentError(
    currency: SupportedCheckoutCurrency,
    errorCode: StripeIntentErrorCode | null,
  ) {
    this.stripeIntentErrors = {
      ...this.stripeIntentErrors,
      [currency]: errorCode,
    };
  }
}
