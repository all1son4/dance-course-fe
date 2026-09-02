import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CHECKOUT_CURRENCY,
  DEFAULT_CHECKOUT_PRODUCT,
  SELLABLE_PRODUCTS_LIST,
  type SellableProduct,
} from "@/constants/sellable-products";

import { PaymentStore } from "./payment-store";

const VALID_CUSTOMER_DATA = {
  address: "ul. Testowa 1",
  city: "Warszawa",
  country: "PL",
  email: "anna@example.com",
  fullName: "Анна Строк",
  lessonLanguage: "ru",
  nickname: "@anna_strok",
  postalCode: "00-001",
} as const;

const cloneCatalog = (): SellableProduct[] =>
  structuredClone(SELLABLE_PRODUCTS_LIST) as SellableProduct[];

const fillValidCheckout = (store: PaymentStore) => {
  store.setSellableProducts(cloneCatalog());

  for (const [fieldName, value] of Object.entries(VALID_CUSTOMER_DATA)) {
    store.setCustomerField(fieldName as keyof typeof VALID_CUSTOMER_DATA, value);
  }

  for (const fieldName of Object.keys(store.agreements)) {
    store.setAgreement(fieldName as keyof typeof store.agreements, true);
  }
};

test("draft snapshot restores the checkout after an apply round-trip", () => {
  const source = new PaymentStore();
  fillValidCheckout(source);
  source.setSelectedCurrency("eur");

  const snapshot = source.getCheckoutDraftSnapshot();
  const restored = new PaymentStore();
  restored.applyCheckoutDraft(snapshot);

  assert.equal(restored.checkoutSessionId, source.checkoutSessionId);
  assert.equal(restored.selectedCurrency, "eur");
  assert.equal(restored.selectedProductId, source.selectedProductId);
  assert.equal(restored.selectedOfferId, source.selectedOfferId);
  assert.deepEqual(restored.customerData, source.customerData);
  assert.deepEqual(restored.agreements, source.agreements);
  assert.equal(typeof snapshot.updatedAt, "number");
});

test("a malformed draft falls back to safe defaults", () => {
  const store = new PaymentStore();

  store.applyCheckoutDraft({
    agreements: { unexpected: "yes" } as never,
    checkoutSessionId: "   ",
    customerData: { email: 42, unexpectedField: "x" } as never,
    selectedCurrency: "usd" as never,
    selectedOfferId: "off_missing",
    selectedProductId: "prd_missing",
    validationLocale: "de" as never,
  });

  assert.equal(store.selectedProductId, DEFAULT_CHECKOUT_PRODUCT.id);
  assert.equal(store.selectedOfferId, DEFAULT_CHECKOUT_PRODUCT.defaultOfferId);
  assert.equal(store.selectedCurrency, DEFAULT_CHECKOUT_CURRENCY);
  assert.equal(store.validationLocale, "ru");
  assert.ok(store.checkoutSessionId.length > 0);
  assert.equal(store.customerData.email, "");
  assert.equal(
    Object.values(store.agreements).every((value) => value === false),
    true,
  );
});

test("an empty catalog marks the checkout unavailable and drops intent state", () => {
  const store = new PaymentStore();
  store.stripeClientSecrets = { pln: "secret_pln" };

  store.setSellableProducts([]);

  assert.equal(store.catalogStatus, "unavailable");
  assert.equal(store.isCatalogUnavailable, true);
  assert.deepEqual(store.stripeClientSecrets, {});
});

test("a catalog without the selected product marks the checkout unavailable", () => {
  const store = new PaymentStore();
  const catalog = cloneCatalog().filter(
    (product) => product.id !== store.selectedProductId,
  );

  store.setSellableProducts(catalog);

  assert.equal(store.catalogStatus, "unavailable");
});

test("a product with disabled sales closes the checkout instead of erroring", () => {
  const store = new PaymentStore();
  const catalog = cloneCatalog();
  const selected = catalog.find((product) => product.id === store.selectedProductId);
  assert.ok(selected);
  selected.salesEnabled = false;

  store.setSellableProducts(catalog);

  assert.equal(store.catalogStatus, "closed");
  assert.equal(store.isSalesClosed, true);
});

test("server initialization renders the requested checkout in its final state", () => {
  const catalog = cloneCatalog();
  const selected = catalog.find((product) => product.id !== DEFAULT_CHECKOUT_PRODUCT.id);
  assert.ok(selected);
  selected.salesEnabled = false;

  const store = new PaymentStore({
    currency: "eur",
    offerId: selected.defaultOfferId,
    productId: selected.id,
    renewalCampaignSlug: "renewal-link",
    sellableProducts: catalog,
  });

  assert.equal(store.selectedProductId, selected.id);
  assert.equal(store.selectedOfferId, selected.defaultOfferId);
  assert.equal(store.selectedCurrency, "eur");
  assert.equal(store.renewalCampaignSlug, "renewal-link");
  assert.equal(store.catalogStatus, "closed");
});

test("server initialization keeps an unavailable catalog distinct from closed sales", () => {
  const store = new PaymentStore({
    currency: "pln",
    sellableProducts: null,
  });

  assert.equal(store.catalogStatus, "unavailable");
  assert.equal(store.isCatalogUnavailable, true);
  assert.equal(store.isSalesClosed, false);
});

test("a link to a product the catalogue no longer sells falls back to the default selection", () => {
  const removed = SELLABLE_PRODUCTS_LIST.find(
    (product) => product.id !== DEFAULT_CHECKOUT_PRODUCT.id,
  );
  assert.ok(removed);
  const catalog = cloneCatalog().filter((product) => product.id !== removed.id);

  const store = new PaymentStore({
    currency: "eur",
    offerId: removed.defaultOfferId,
    productId: removed.id,
    sellableProducts: catalog,
  });

  // The requested product is gone but the catalogue is authoritative, so the
  // stale-link notice (driven by the missing id) applies - not "unavailable".
  assert.equal(store.hasAuthoritativeCatalog, true);
  assert.equal(store.isCatalogUnavailable, false);
  assert.equal(store.selectedProductId, DEFAULT_CHECKOUT_PRODUCT.id);
  assert.equal(
    store.sellableProducts.some((product) => product.id === removed.id),
    false,
  );
});

test("a renewal checkout whose target left the catalogue stays unavailable", () => {
  const removed = SELLABLE_PRODUCTS_LIST.find(
    (product) => product.id !== DEFAULT_CHECKOUT_PRODUCT.id,
  );
  assert.ok(removed);
  const catalog = cloneCatalog().filter((product) => product.id !== removed.id);

  const store = new PaymentStore({
    currency: "eur",
    offerId: removed.defaultOfferId,
    productId: removed.id,
    renewalCampaignSlug: "renewal-link",
    sellableProducts: catalog,
  });

  assert.equal(store.catalogStatus, "unavailable");
});

test("a price change during catalog refresh invalidates minted intents", () => {
  const store = new PaymentStore();
  store.setSellableProducts(cloneCatalog());
  store.stripeClientSecrets = { pln: "secret_pln" };
  const revisionBefore = store.stripeIntentStateRevision;

  const repricedCatalog = cloneCatalog();
  const selected = repricedCatalog.find(
    (product) => product.id === store.selectedProductId,
  );
  assert.ok(selected);
  selected.offers.forEach((offer) => {
    offer.prices = { ...offer.prices, pln: offer.prices.pln + 1 };
  });

  store.setSellableProducts(repricedCatalog);

  assert.deepEqual(store.stripeClientSecrets, {});
  assert.ok(store.stripeIntentStateRevision > revisionBefore);
});

test("selecting the already-selected product keeps intent state untouched", () => {
  const store = new PaymentStore();
  store.setSellableProducts(cloneCatalog());
  store.stripeClientSecrets = { pln: "secret_pln" };
  const revisionBefore = store.stripeIntentStateRevision;

  store.configureCheckoutSelection({
    offerId: store.selectedOfferId,
    productId: store.selectedProductId,
  });

  assert.equal(store.stripeIntentStateRevision, revisionBefore);
  assert.deepEqual(store.stripeClientSecrets, { pln: "secret_pln" });
});

test("switching products clears intent state and bumps the revision", () => {
  const store = new PaymentStore();
  store.setSellableProducts(cloneCatalog());
  store.stripeClientSecrets = { pln: "secret_pln" };
  const revisionBefore = store.stripeIntentStateRevision;
  const otherProduct = store.sellableProducts.find(
    (product) => product.id !== store.selectedProductId,
  );
  assert.ok(otherProduct);

  store.configureCheckoutSelection({ productId: otherProduct.id });

  assert.equal(store.selectedProductId, otherProduct.id);
  assert.deepEqual(store.stripeClientSecrets, {});
  assert.ok(store.stripeIntentStateRevision > revisionBefore);
});

test("switching checkout links updates the visible sales state synchronously", () => {
  const catalog = cloneCatalog();
  const closedProduct = catalog.find(
    (product) => product.id !== DEFAULT_CHECKOUT_PRODUCT.id,
  );
  assert.ok(closedProduct);
  closedProduct.salesEnabled = false;
  const store = new PaymentStore({
    currency: "pln",
    sellableProducts: catalog,
  });

  store.configureCheckoutSelection({ productId: closedProduct.id });
  assert.equal(store.catalogStatus, "closed");

  store.configureCheckoutSelection({ productId: DEFAULT_CHECKOUT_PRODUCT.id });
  assert.equal(store.catalogStatus, "ready");
});

test("canShowStripe requires a ready catalog, consents, and valid data", () => {
  const store = new PaymentStore();
  assert.equal(store.canShowStripe, false);

  fillValidCheckout(store);
  assert.equal(store.canShowStripe, true);

  store.setAgreement("privacyPolicyAcknowledgement", false);
  assert.equal(store.canShowStripe, false);

  store.setAgreement("privacyPolicyAcknowledgement", true);
  store.setCustomerField("email", "not-an-email");
  assert.equal(store.canShowStripe, false);
});

test("field errors appear only after the field is touched", () => {
  const store = new PaymentStore();

  store.setCustomerField("email", "broken");
  assert.equal(store.customerErrors.email, undefined);

  store.touchCustomerField("email");
  assert.ok(store.customerErrors.email);

  store.setCustomerField("email", "anna@example.com");
  assert.equal(store.customerErrors.email, undefined);
});

test("validateCustomerForm reports every missing field at once", () => {
  const store = new PaymentStore();

  store.validateCustomerForm();

  assert.ok(store.customerErrors.fullName);
  assert.ok(store.customerErrors.email);
  assert.ok(store.customerErrors.nickname);
  assert.equal(Object.values(store.touchedFields).every(Boolean), true);
});

test("customer input is normalized before it is stored", () => {
  const store = new PaymentStore();

  store.setCustomerField("nickname", "anna_strok");
  assert.equal(store.customerData.nickname, "@anna_strok");

  store.setCustomerField("country", "pl");
  assert.equal(store.customerData.country, "PL");

  store.setCustomerField("lessonLanguage", "EN ");
  assert.equal(store.customerData.lessonLanguage, "en");

  store.setCustomerField("fullName", "  Анна   Строк");
  assert.equal(store.customerData.fullName, "Анна Строк");
});

test("editing customer data drops an already minted intent unless opted out", () => {
  const store = new PaymentStore();
  store.stripeClientSecrets = { pln: "secret_pln" };

  store.setCustomerField("city", "Kraków", { skipStripeIntentReset: true });
  assert.deepEqual(store.stripeClientSecrets, { pln: "secret_pln" });

  store.setCustomerField("city", "Gdańsk");
  assert.deepEqual(store.stripeClientSecrets, {});
});

test("checkout currency initializes once and only accepts supported values", () => {
  const store = new PaymentStore();

  store.initializeCheckoutCurrency("eur");
  assert.equal(store.selectedCurrency, "eur");

  store.initializeCheckoutCurrency("pln");
  assert.equal(store.selectedCurrency, "eur");

  store.setSelectedCurrency("usd" as never);
  assert.equal(store.selectedCurrency, DEFAULT_CHECKOUT_CURRENCY);
});

test("resetCheckoutForm starts a fresh session with default state", () => {
  const store = new PaymentStore();
  fillValidCheckout(store);
  store.setSelectedCurrency("eur");
  const previousSessionId = store.checkoutSessionId;

  store.resetCheckoutForm();

  assert.notEqual(store.checkoutSessionId, previousSessionId);
  assert.equal(store.selectedCurrency, DEFAULT_CHECKOUT_CURRENCY);
  assert.equal(store.customerData.email, "");
  assert.equal(store.areAllAgreementsAccepted, false);
  assert.equal(store.renewalCampaignSlug, "");
});

test("setting a renewal slug invalidates intents minted without it", () => {
  const store = new PaymentStore();
  store.stripeClientSecrets = { pln: "secret_pln" };

  store.setRenewalCampaignSlug("  spring-renewal  ");

  assert.equal(store.renewalCampaignSlug, "spring-renewal");
  assert.deepEqual(store.stripeClientSecrets, {});
});
