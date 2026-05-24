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
type StripeIntentResponse = {
  clientSecret?: string;
  errorCode?: StripeIntentErrorCode;
  paymentIntentId?: string;
};

export type PaymentCheckoutDraft = {
  agreements: PaymentAgreementState;
  checkoutSessionId: string;
  customerData: PaymentCustomerData;
  selectedCurrency: SupportedCheckoutCurrency;
  selectedOfferId: string;
  selectedProductId: string;
  updatedAt: number;
  validationLocale: PaymentValidationLocale;
};

const createCheckoutSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const PAYMENT_INTENT_REQUEST_TIMEOUT_MS = 10_000;
const PAYMENT_INTENT_MAX_RETRY_ATTEMPTS = 2;
const PAYMENT_INTENT_RETRY_BASE_DELAY_MS = 300;
const PAYMENT_CUSTOMER_FIELD_NAMES = PAYMENT_INPUTS.map(({ name }) => name);
const PAYMENT_AGREEMENT_FIELD_NAMES = Object.keys(
  INITIAL_AGREEMENTS,
) as PaymentAgreementFieldName[];

const normalizePaymentCustomerDataDraft = (
  customerData: Partial<PaymentCustomerData> = {},
) =>
  PAYMENT_CUSTOMER_FIELD_NAMES.reduce<PaymentCustomerData>(
    (acc, fieldName) => {
      acc[fieldName] = normalizePaymentCustomerFieldValue(
        fieldName,
        customerData[fieldName] ?? INITIAL_CUSTOMER_DATA[fieldName],
      );

      return acc;
    },
    { ...INITIAL_CUSTOMER_DATA },
  );

const normalizePaymentAgreementDraft = (
  agreements: Partial<PaymentAgreementState> = {},
) =>
  PAYMENT_AGREEMENT_FIELD_NAMES.reduce<PaymentAgreementState>(
    (acc, fieldName) => {
      acc[fieldName] = Boolean(agreements[fieldName] ?? INITIAL_AGREEMENTS[fieldName]);

      return acc;
    },
    { ...INITIAL_AGREEMENTS },
  );

const getStripeIntentErrorCode = (error: unknown): StripeIntentErrorCode => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "payment_intent_request_failed";
  }

  if (error instanceof TypeError) {
    return "payment_intent_request_failed";
  }

  if (error instanceof Error) {
    return error.message as StripeIntentErrorCode;
  }

  return "payment_intent_request_failed";
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
  stripeIntentStateRevision = 0;

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
    return this.customerSchema.isValidSync({
      ...INITIAL_CUSTOMER_DATA,
      ...this.customerData,
    });
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

  getCheckoutDraftSnapshot(): PaymentCheckoutDraft {
    this.ensureCustomerDataShape();

    return {
      agreements: { ...this.agreements },
      checkoutSessionId: this.checkoutSessionId,
      customerData: { ...this.customerData },
      selectedCurrency: this.selectedCurrency,
      selectedOfferId: this.selectedOfferId,
      selectedProductId: this.selectedProductId,
      updatedAt: Date.now(),
      validationLocale: this.validationLocale,
    };
  }

  applyCheckoutDraft(draft: Partial<PaymentCheckoutDraft>) {
    const nextProduct =
      getSellableProductById(draft.selectedProductId) ?? this.selectedProduct;
    const nextOffer =
      getSellableProductOfferById(nextProduct, draft.selectedOfferId) ??
      getDefaultProductOffer(nextProduct);
    const nextCurrency = getResolvedCheckoutCurrency(
      draft.selectedCurrency ?? this.selectedCurrency,
    );
    const nextCheckoutSessionId = (draft.checkoutSessionId ?? "").trim();
    const nextValidationLocale = resolvePaymentValidationLocale(
      draft.validationLocale ?? this.validationLocale,
    );

    this.selectedProductId = nextProduct.id;
    this.selectedOfferId = nextOffer.id;
    this.selectedCurrency = nextCurrency;
    this.checkoutCurrencyInitialized = true;
    this.checkoutSessionId = nextCheckoutSessionId || createCheckoutSessionId();
    this.validationLocale = nextValidationLocale;

    this.customerData = normalizePaymentCustomerDataDraft(draft.customerData);
    this.agreements = normalizePaymentAgreementDraft(draft.agreements);

    this.customerErrors = {};
    this.touchedFields = {};
    this.clearStripeIntentState(false);
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

  setCustomerField(
    fieldName: PaymentCustomerFieldName,
    value: string,
    options?: { skipStripeIntentReset?: boolean },
  ) {
    this.ensureCustomerDataShape();

    const nextValue = normalizePaymentCustomerFieldValue(fieldName, value);
    const hasValueChanged = this.customerData[fieldName] !== nextValue;

    if (hasValueChanged) {
      this.customerData[fieldName] = nextValue;

      if (this.hasStripeIntentState && !options?.skipStripeIntentReset) {
        this.clearStripeIntentState(false);
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
    const requestRevision = this.stripeIntentStateRevision;

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
      let data: StripeIntentResponse | null = null;
      let lastErrorCode: StripeIntentErrorCode = "payment_intent_request_failed";

      // Stripe intent creation is a network boundary in the checkout flow, so retry
      // only transport-like failures and keep API validation failures visible.
      for (let attempt = 0; attempt <= PAYMENT_INTENT_MAX_RETRY_ATTEMPTS; attempt += 1) {
        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => {
          requestController.abort();
        }, PAYMENT_INTENT_REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch("/api/stripe/payment-intent", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              checkoutLocale: this.validationLocale,
              checkoutSessionId: this.checkoutSessionId,
              customerData: this.customerData,
              currency: resolvedCurrency,
              offerId: this.selectedOffer.id,
              productId: this.selectedProduct.id,
            }),
            signal: requestController.signal,
          });

          const responseData = (await response.json()) as StripeIntentResponse;

          if (!response.ok) {
            const errorCode = responseData.errorCode ?? "payment_intent_request_failed";
            lastErrorCode = errorCode;

            if (
              this.isRetryableStripeIntentError(errorCode) &&
              attempt < PAYMENT_INTENT_MAX_RETRY_ATTEMPTS
            ) {
              await this.waitForNextStripeIntentRetry(attempt);
              continue;
            }

            throw new Error(errorCode);
          }

          if (!responseData.clientSecret) {
            lastErrorCode = "missing_client_secret";
            throw new Error("missing_client_secret");
          }

          data = responseData;
          break;
        } catch (error) {
          const errorCode = getStripeIntentErrorCode(error);

          lastErrorCode = errorCode;

          if (
            this.isRetryableStripeIntentError(errorCode) &&
            attempt < PAYMENT_INTENT_MAX_RETRY_ATTEMPTS
          ) {
            await this.waitForNextStripeIntentRetry(attempt);
            continue;
          }

          throw error;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      if (!data?.clientSecret) {
        throw new Error(lastErrorCode);
      }

      if (this.isStripeIntentRequestStale(requestRevision)) {
        // The customer changed checkout data while this request was in flight.
        // The old intent is canceled so Stripe does not keep unused attempts open.
        if (data.paymentIntentId) {
          this.cancelStripePaymentIntents([data.paymentIntentId], this.checkoutSessionId);
        }
        return;
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
      if (this.isStripeIntentRequestStale(requestRevision)) {
        return;
      }

      runInAction(() => {
        const errorCode = getStripeIntentErrorCode(error);

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

  private isRetryableStripeIntentError(errorCode: StripeIntentErrorCode) {
    return errorCode === "payment_intent_request_failed";
  }

  private async waitForNextStripeIntentRetry(attempt: number) {
    const delay = Math.min(PAYMENT_INTENT_RETRY_BASE_DELAY_MS * 2 ** attempt, 1500);

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, delay);
    });
  }

  validateCustomerField(fieldName: PaymentCustomerFieldName) {
    this.ensureCustomerDataShape();

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
    this.ensureCustomerDataShape();
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
    const previousCheckoutSessionId = this.checkoutSessionId;

    this.clearStripeIntentState(true, previousCheckoutSessionId);
    this.checkoutSessionId = createCheckoutSessionId();
    this.customerData = normalizePaymentCustomerDataDraft();
    this.customerErrors = {};
    this.touchedFields = {};
    this.agreements = normalizePaymentAgreementDraft();
    this.validationLocale = "ru";
    this.selectedCurrency = DEFAULT_CHECKOUT_CURRENCY;
    this.selectedOfferId = DEFAULT_CHECKOUT_PRODUCT.defaultOfferId;
    this.selectedProductId = DEFAULT_CHECKOUT_PRODUCT.id;
    this.checkoutCurrencyInitialized = false;
  }

  clearStripeIntentState(
    cancelActiveIntents = false,
    checkoutSessionId = this.checkoutSessionId,
  ) {
    this.stripeIntentStateRevision += 1;

    // Resetting the revision invalidates any in-flight creation request. When the
    // reset is caused by a real checkout change, cancel the already-created intents.
    const activePaymentIntentIds = cancelActiveIntents
      ? Object.values(this.stripePaymentIntentIds).filter(Boolean)
      : [];

    this.stripeClientSecrets = {};
    this.stripePaymentIntentIds = {};
    this.stripeIntentErrors = {};
    this.pendingStripeCurrencies.clear();

    if (activePaymentIntentIds.length > 0) {
      this.cancelStripePaymentIntents(activePaymentIntentIds, checkoutSessionId);
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

  private ensureCustomerDataShape() {
    const nextCustomerData = {
      ...INITIAL_CUSTOMER_DATA,
      ...this.customerData,
    };
    const hasMissingField = PAYMENT_INPUTS.some(
      (field) => typeof this.customerData[field.name] !== "string",
    );

    if (!hasMissingField) {
      return;
    }

    this.customerData = nextCustomerData;
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

  private isStripeIntentRequestStale(requestRevision: number) {
    return requestRevision !== this.stripeIntentStateRevision;
  }

  private revalidateTouchedFields() {
    PAYMENT_INPUTS.forEach((field) => {
      if (!this.touchedFields[field.name]) {
        return;
      }

      this.validateCustomerField(field.name);
    });
  }

  private cancelStripePaymentIntents(
    paymentIntentIds: string[],
    checkoutSessionId: string,
  ) {
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
          checkoutSessionId,
          paymentIntentId,
        }),
        keepalive: true,
      }).catch(() => undefined);
    });
  }
}
