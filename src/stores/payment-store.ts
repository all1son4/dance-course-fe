import { makeAutoObservable, runInAction } from "mobx";
import { ValidationError } from "yup";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
  normalizePaymentCustomerFieldValue,
  PAYMENT_INPUTS,
  type PaymentAgreementFieldName,
  type PaymentAgreementState,
  type PaymentCustomerData,
  type PaymentCustomerFieldName,
} from "@/app/[locale]/payment/payment.constants";
import {
  getPaymentCustomerSchema,
  type PaymentValidationLocale,
  resolvePaymentValidationLocale,
} from "@/app/[locale]/payment/payment.validation";
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
type StripePaymentIntentIds = Partial<Record<SupportedCheckoutCurrency, string>>;
type StripeIntentErrors = Partial<
  Record<SupportedCheckoutCurrency, StripeIntentErrorCode | null>
>;
type StripeIntentErrorCode =
  | "missing_client_secret"
  | "missing_secret_key"
  | "payment_intent_failed"
  | "payment_intent_request_failed";

const createCheckoutSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

export class PaymentStore {
  checkoutSessionId = createCheckoutSessionId();
  customerData: PaymentCustomerData = { ...INITIAL_CUSTOMER_DATA };
  customerErrors: PaymentCustomerErrors = {};
  touchedFields: PaymentCustomerTouched = {};
  agreements: PaymentAgreementState = { ...INITIAL_AGREEMENTS };
  validationLocale: PaymentValidationLocale = "ru";
  selectedCurrency: SupportedCheckoutCurrency = DEFAULT_CHECKOUT_CURRENCY;
  selectedOfferId = DEFAULT_CHECKOUT_PRODUCT.defaultOfferId;
  selectedProductId = DEFAULT_CHECKOUT_PRODUCT.id;
  checkoutCurrencyInitialized = false;
  stripeClientSecrets: StripeClientSecrets = {};
  stripePaymentIntentIds: StripePaymentIntentIds = {};
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
    return this.customerSchema.isValidSync(this.customerData);
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

  get stripePaymentIntentId() {
    return this.getStripePaymentIntentId(this.selectedCurrency);
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
    this.clearStripeIntentState(true);
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
    const nextValue = normalizePaymentCustomerFieldValue(fieldName, value);
    const hasValueChanged = this.customerData[fieldName] !== nextValue;

    if (hasValueChanged) {
      this.customerData[fieldName] = nextValue;

      if (this.hasStripeIntentState) {
        this.clearStripeIntentState(true);
      }
    }

    if (this.touchedFields[fieldName]) {
      this.validateCustomerField(fieldName);
    }
  }

  setValidationLocale(locale: string | null | undefined) {
    const nextLocale = resolvePaymentValidationLocale(locale);

    if (nextLocale === this.validationLocale) {
      return;
    }

    this.validationLocale = nextLocale;
    this.revalidateTouchedFields();
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

  getStripePaymentIntentId(currency: SupportedCheckoutCurrency) {
    const resolvedCurrency = getResolvedCheckoutCurrency(currency);

    return this.stripePaymentIntentIds[resolvedCurrency] ?? "";
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
          checkoutSessionId: this.checkoutSessionId,
          customerData: this.customerData,
          currency: resolvedCurrency,
          offerId: this.selectedOffer.id,
          productId: this.selectedProduct.id,
        }),
      });

      const data = (await response.json()) as {
        clientSecret?: string;
        errorCode?: StripeIntentErrorCode;
        paymentIntentId?: string;
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
        this.stripePaymentIntentIds = {
          ...this.stripePaymentIntentIds,
          [resolvedCurrency]: data.paymentIntentId ?? "",
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
        this.stripePaymentIntentIds = {
          ...this.stripePaymentIntentIds,
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
      this.customerSchema.validateSyncAt(fieldName, this.customerData);
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
      this.customerSchema.validateSync(this.customerData, {
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
    this.checkoutSessionId = createCheckoutSessionId();
    this.customerData = { ...INITIAL_CUSTOMER_DATA };
    this.customerErrors = {};
    this.touchedFields = {};
    this.agreements = { ...INITIAL_AGREEMENTS };
    this.validationLocale = "ru";
    this.selectedCurrency = DEFAULT_CHECKOUT_CURRENCY;
    this.selectedOfferId = DEFAULT_CHECKOUT_PRODUCT.defaultOfferId;
    this.selectedProductId = DEFAULT_CHECKOUT_PRODUCT.id;
    this.checkoutCurrencyInitialized = false;
    this.clearStripeIntentState(true);
  }

  clearStripeIntentState(cancelActiveIntents = false) {
    const activePaymentIntentIds = cancelActiveIntents
      ? Object.values(this.stripePaymentIntentIds).filter(Boolean)
      : [];

    this.stripeClientSecrets = {};
    this.stripePaymentIntentIds = {};
    this.stripeIntentErrors = {};
    this.pendingStripeCurrencies.clear();

    if (activePaymentIntentIds.length > 0) {
      this.cancelStripePaymentIntents(activePaymentIntentIds);
    }
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

  private get customerSchema() {
    return getPaymentCustomerSchema(this.validationLocale);
  }

  private get hasStripeIntentState() {
    return (
      Object.keys(this.stripeClientSecrets).length > 0 ||
      Object.keys(this.stripePaymentIntentIds).length > 0 ||
      Object.keys(this.stripeIntentErrors).length > 0
    );
  }

  private revalidateTouchedFields() {
    PAYMENT_INPUTS.forEach((field) => {
      if (!this.touchedFields[field.name]) {
        return;
      }

      this.validateCustomerField(field.name);
    });
  }

  private cancelStripePaymentIntents(paymentIntentIds: string[]) {
    if (typeof window === "undefined") {
      return;
    }

    const uniquePaymentIntentIds = [...new Set(paymentIntentIds)];

    uniquePaymentIntentIds.forEach((paymentIntentId) => {
      void fetch("/api/stripe/payment-intent/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentIntentId,
        }),
        keepalive: true,
      }).catch(() => undefined);
    });
  }
}
