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
  SELLABLE_PRODUCTS_LIST,
  type SellableProduct,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";
import { trackApiError } from "@/lib/mixpanel-analytics";

type PaymentCustomerErrors = Partial<Record<PaymentCustomerFieldName, string>>;
type PaymentCustomerTouched = Partial<Record<PaymentCustomerFieldName, boolean>>;
type StripeClientSecrets = Partial<Record<SupportedCheckoutCurrency, string>>;
type StripePaymentIntentIds = Partial<Record<SupportedCheckoutCurrency, string>>;
type StripeIntentErrors = Partial<
  Record<SupportedCheckoutCurrency, StripeIntentErrorCode | null>
>;
export type SellableCatalogStatus = "closed" | "loading" | "ready" | "unavailable";
type StripeIntentErrorCode =
  | "catalog_unavailable"
  | "consent_evidence_failed"
  | "invalid_customer_data"
  | "missing_client_secret"
  | "missing_secret_key"
  | "online_group_campaign_not_configured"
  | "payment_intent_failed"
  | "payment_intent_request_failed"
  | "required_consent_missing"
  | "renewal_campaign_inactive"
  | "renewal_payment_context_mismatch"
  | "sales_closed"
  | "telegram_renewal_verification_required";
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
const PAYMENT_INTENT_MAX_RETRY_DELAY_MS = 1_500;
const PAYMENT_CUSTOMER_FIELD_NAMES = PAYMENT_INPUTS.map(({ name }) => name);
const PAYMENT_AGREEMENT_FIELD_NAMES = Object.keys(
  INITIAL_AGREEMENTS,
) as PaymentAgreementFieldName[];

const normalizePaymentCustomerDataDraft = (
  customerData: Partial<PaymentCustomerData> = {},
) =>
  PAYMENT_CUSTOMER_FIELD_NAMES.reduce<PaymentCustomerData>(
    (acc, fieldName) => {
      // Drafts come from sessionStorage, so a field may hold any JSON value; a
      // non-string falls back to the default instead of failing the whole draft.
      const draftValue = customerData[fieldName];

      acc[fieldName] = normalizePaymentCustomerFieldValue(
        fieldName,
        typeof draftValue === "string" ? draftValue : INITIAL_CUSTOMER_DATA[fieldName],
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
  catalogStatus: SellableCatalogStatus = "loading";
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
  sellableProducts: SellableProduct[] = SELLABLE_PRODUCTS_LIST;
  renewalCampaignSlug = "";

  constructor() {
    // Request helpers remain outside MobX instrumentation so decomposition does
    // not introduce action boundaries around the existing async control flow.
    makeAutoObservable<
      PaymentStore,
      | "getStripePaymentIntentRequestOptions"
      | "isStripePaymentIntentRequestBlocked"
      | "shouldRetryStripePaymentIntent"
      | "storeFailedStripePaymentIntent"
      | "storeSuccessfulStripePaymentIntent"
    >(
      this,
      {
        getStripePaymentIntentRequestOptions: false,
        isStripePaymentIntentRequestBlocked: false,
        pendingStripeCurrencies: false,
        shouldRetryStripePaymentIntent: false,
        storeFailedStripePaymentIntent: false,
        storeSuccessfulStripePaymentIntent: false,
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
    return (
      this.catalogStatus === "ready" &&
      this.areAllAgreementsAccepted &&
      this.isCustomerDataValid
    );
  }

  get isCatalogUnavailable() {
    return this.catalogStatus === "unavailable";
  }

  get isSalesClosed() {
    return this.catalogStatus === "closed";
  }

  get selectedProduct() {
    return (
      this.getSellableProductById(this.selectedProductId) ??
      this.sellableProducts[0] ??
      DEFAULT_CHECKOUT_PRODUCT
    );
  }

  get selectedOffer() {
    return (
      this.getSellableProductOfferById(this.selectedProduct, this.selectedOfferId) ??
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

  setSellableProducts(products: SellableProduct[]) {
    if (products.length === 0) {
      this.setCatalogUnavailable();
      return;
    }

    const previousProductId = this.selectedProduct.id;
    const previousOfferId = this.selectedOffer.id;
    const previousPrice = this.selectedPrice;
    const nextProduct =
      products.find((product) => product.id === this.selectedProductId) ?? null;
    const nextOffer = nextProduct
      ? this.getSellableProductOfferById(nextProduct, this.selectedOfferId)
      : null;

    if (!nextProduct || !nextOffer) {
      this.setCatalogUnavailable();
      return;
    }

    this.sellableProducts = products;
    this.selectedProductId = nextProduct.id;
    this.selectedOfferId = nextOffer.id;

    // A closed product stays in the catalogue so its title and price still render;
    // only the payment step is withheld.
    if (!nextProduct.salesEnabled) {
      this.setSalesClosed();
      return;
    }

    this.catalogStatus = "ready";

    if (
      previousProductId !== nextProduct.id ||
      previousOfferId !== nextOffer.id ||
      previousPrice !== this.selectedPrice
    ) {
      this.clearStripeIntentState(true);
    }
  }

  setCatalogUnavailable() {
    this.catalogStatus = "unavailable";
    this.clearStripeIntentState(true);
  }

  setSalesClosed() {
    this.catalogStatus = "closed";
    // Drops any client secret minted before the switch was flipped, so a tab
    // left open across the closing cannot confirm a stale PaymentIntent.
    this.clearStripeIntentState(true);
  }

  applyCheckoutDraft(draft: Partial<PaymentCheckoutDraft>) {
    const nextProduct =
      this.getSellableProductById(draft.selectedProductId) ?? this.selectedProduct;
    const nextOffer =
      this.getSellableProductOfferById(nextProduct, draft.selectedOfferId) ??
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
    const nextProduct =
      this.getSellableProductById(productId) ??
      this.getSellableProductById(DEFAULT_CHECKOUT_PRODUCT.id) ??
      this.sellableProducts[0] ??
      DEFAULT_CHECKOUT_PRODUCT;
    const nextOffer =
      this.getSellableProductOfferById(nextProduct, offerId) ??
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

  setRenewalCampaignSlug(slug: string | null | undefined) {
    const nextSlug = (slug ?? "").trim();

    if (nextSlug === this.renewalCampaignSlug) {
      return;
    }

    this.renewalCampaignSlug = nextSlug;
    this.clearStripeIntentState(true);
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

    if (this.isStripePaymentIntentRequestBlocked(resolvedCurrency)) {
      return;
    }

    this.pendingStripeCurrencies.add(resolvedCurrency);
    this.setStripeIntentError(resolvedCurrency, null);

    let finalHttpStatus: number | undefined;

    try {
      let data: StripeIntentResponse | null = null;
      let lastErrorCode: StripeIntentErrorCode = "payment_intent_request_failed";

      // Stripe intent creation is a network boundary in the checkout flow, so retry
      // only transport-like failures and keep API validation failures visible. The
      // awaits stay in this method so no extra microtask can precede the stale check.
      for (let attempt = 0; attempt <= PAYMENT_INTENT_MAX_RETRY_ATTEMPTS; attempt += 1) {
        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => {
          requestController.abort();
        }, PAYMENT_INTENT_REQUEST_TIMEOUT_MS);

        try {
          finalHttpStatus = undefined;
          const response = await fetch(
            "/api/stripe/payment-intent",
            this.getStripePaymentIntentRequestOptions(
              resolvedCurrency,
              requestController.signal,
            ),
          );
          finalHttpStatus = response.ok ? undefined : response.status;
          const responseData = (await response.json()) as StripeIntentResponse;

          if (!response.ok) {
            const errorCode = responseData.errorCode ?? "payment_intent_request_failed";
            lastErrorCode = errorCode;

            if (this.shouldRetryStripePaymentIntent(errorCode, attempt)) {
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

          if (this.shouldRetryStripePaymentIntent(errorCode, attempt)) {
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

      this.storeSuccessfulStripePaymentIntent(resolvedCurrency, data);
    } catch (error) {
      if (this.isStripeIntentRequestStale(requestRevision)) {
        return;
      }

      void trackApiError({
        endpoint: "/api/stripe/payment-intent",
        errorCode: getStripeIntentErrorCode(error),
        failureStage: "intent_creation",
        method: "POST",
        status: finalHttpStatus,
      });
      this.storeFailedStripePaymentIntent(resolvedCurrency, error);
    } finally {
      this.pendingStripeCurrencies.delete(resolvedCurrency);
    }
  }

  private isStripePaymentIntentRequestBlocked(currency: SupportedCheckoutCurrency) {
    return (
      !this.canShowStripe ||
      Boolean(this.getStripeClientSecret(currency)) ||
      this.pendingStripeCurrencies.has(currency)
    );
  }

  private getStripePaymentIntentRequestOptions(
    currency: SupportedCheckoutCurrency,
    signal: AbortSignal,
  ): RequestInit {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agreements: this.agreements,
        checkoutLocale: this.validationLocale,
        checkoutSessionId: this.checkoutSessionId,
        customerData: this.customerData,
        currency,
        offerId: this.selectedOffer.id,
        productId: this.selectedProduct.id,
        renewalCampaignSlug: this.renewalCampaignSlug,
      }),
      signal,
    };
  }

  private shouldRetryStripePaymentIntent(
    errorCode: StripeIntentErrorCode,
    attempt: number,
  ) {
    return (
      this.isRetryableStripeIntentError(errorCode) &&
      attempt < PAYMENT_INTENT_MAX_RETRY_ATTEMPTS
    );
  }

  private storeSuccessfulStripePaymentIntent(
    currency: SupportedCheckoutCurrency,
    data: StripeIntentResponse,
  ) {
    runInAction(() => {
      this.stripeClientSecrets = {
        ...this.stripeClientSecrets,
        [currency]: data.clientSecret ?? "",
      };
      this.stripePaymentIntentIds = {
        ...this.stripePaymentIntentIds,
        [currency]: data.paymentIntentId ?? "",
      };
      this.setStripeIntentError(currency, null);
    });
  }

  private storeFailedStripePaymentIntent(
    currency: SupportedCheckoutCurrency,
    error: unknown,
  ) {
    runInAction(() => {
      const errorCode = getStripeIntentErrorCode(error);

      this.stripeClientSecrets = {
        ...this.stripeClientSecrets,
        [currency]: "",
      };
      this.stripePaymentIntentIds = {
        ...this.stripePaymentIntentIds,
        [currency]: "",
      };
      this.setStripeIntentError(currency, errorCode);

      // A tab opened before the switch was flipped still believes the catalogue
      // is ready. The server just said otherwise, so settle into the closed
      // state instead of leaving a live-looking form behind an error line.
      if (errorCode === "sales_closed") {
        this.setSalesClosed();
      }
    });
  }

  private isRetryableStripeIntentError(errorCode: StripeIntentErrorCode) {
    return (
      errorCode === "consent_evidence_failed" ||
      errorCode === "payment_intent_request_failed"
    );
  }

  private async waitForNextStripeIntentRetry(attempt: number) {
    const delay = Math.min(
      PAYMENT_INTENT_RETRY_BASE_DELAY_MS * 2 ** attempt,
      PAYMENT_INTENT_MAX_RETRY_DELAY_MS,
    );

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
    const defaultProduct =
      this.getSellableProductById(DEFAULT_CHECKOUT_PRODUCT.id) ??
      this.sellableProducts[0] ??
      DEFAULT_CHECKOUT_PRODUCT;
    const defaultOffer = getDefaultProductOffer(defaultProduct);

    this.clearStripeIntentState(true, previousCheckoutSessionId);
    this.checkoutSessionId = createCheckoutSessionId();
    this.customerData = normalizePaymentCustomerDataDraft();
    this.customerErrors = {};
    this.touchedFields = {};
    this.agreements = normalizePaymentAgreementDraft();
    this.validationLocale = "ru";
    this.selectedCurrency = DEFAULT_CHECKOUT_CURRENCY;
    this.selectedOfferId = defaultOffer.id;
    this.selectedProductId = defaultProduct.id;
    this.checkoutCurrencyInitialized = false;
    this.renewalCampaignSlug = "";
  }

  private getSellableProductById(productId: string | null | undefined) {
    return this.sellableProducts.find((product) => product.id === productId);
  }

  private getSellableProductOfferById(
    product: SellableProduct,
    offerId: string | null | undefined,
  ) {
    return product.offers.find((offer) => offer.id === offerId);
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
