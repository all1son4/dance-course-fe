import assert from "node:assert/strict";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  INITIAL_CUSTOMER_DATA,
} from "@/app/[locale]/payment/payment.constants";
import { buildPurchaseAlertText } from "@/app/api/stripe/webhook/_lib/purchase-alert";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";
import { PaymentStore } from "@/stores/payment-store";

const createReadyStore = () => {
  const store = new PaymentStore();

  store.customerData = {
    ...INITIAL_CUSTOMER_DATA,
    address: "Main Street 1",
    city: "Warsaw",
    country: "PL",
    email: "buyer@example.com",
    fullName: "Anna Test",
    nickname: "@anna_test",
    postalCode: "00-001",
  };
  store.agreements = Object.fromEntries(
    Object.keys(INITIAL_AGREEMENTS).map((key) => [key, true]),
  ) as typeof INITIAL_AGREEMENTS;

  return store;
};

const closeSalesFor = (productId: string) =>
  SELLABLE_PRODUCTS_LIST.map((product) =>
    product.id === productId ? { ...product, salesEnabled: false } : product,
  );

const createPaymentRecord = (overrides: Partial<PaymentSheetRecord>) =>
  ({
    ...Object.fromEntries(PAYMENT_SHEET_HEADERS.map((header) => [header, ""])),
    ...overrides,
  }) as PaymentSheetRecord;

test("withholds the payment step for a product whose sales are switched off", () => {
  const store = createReadyStore();

  store.setSellableProducts(SELLABLE_PRODUCTS_LIST);

  assert.equal(store.canShowStripe, true);

  store.setSellableProducts(closeSalesFor(store.selectedProductId));

  assert.equal(store.catalogStatus, "closed");
  assert.equal(store.isSalesClosed, true);
  assert.equal(store.canShowStripe, false);
  // A closed product is not a broken catalogue - the page must say "closed"
  // rather than "temporarily unavailable".
  assert.equal(store.isCatalogUnavailable, false);
});

test("keeps a closed product's price so the summary still renders", () => {
  const store = createReadyStore();

  store.setSellableProducts(SELLABLE_PRODUCTS_LIST);

  const openPrice = store.selectedPrice;

  store.setSellableProducts(closeSalesFor(store.selectedProductId));

  assert.equal(store.selectedProduct.id, store.selectedProductId);
  assert.equal(store.selectedPrice, openPrice);
  assert.ok(store.selectedProduct.title.length > 0);
});

test("drops a client secret minted before sales were closed", () => {
  const store = createReadyStore();

  store.setSellableProducts(SELLABLE_PRODUCTS_LIST);
  store.stripeClientSecrets = { pln: "pi_stale_secret" };

  store.setSellableProducts(closeSalesFor(store.selectedProductId));

  assert.deepEqual(store.stripeClientSecrets, {});
  assert.equal(store.stripeClientSecret, "");
});

test("flags a purchase that settled after sales were closed", () => {
  const paymentRecord = createPaymentRecord({
    amount: "22000",
    checkout_currency: "pln",
    currency: "pln",
    product_id: "prd_L9aK3mT7qP2x",
    product_title: "Online Group by Anna Strok",
  });
  const alertArguments = {
    eventCreatedAtIso: "2026-08-18T17:15:00.000Z",
    eventId: "evt_test",
    eventType: "payment_intent.succeeded",
    paymentRecord,
    processedAtIso: "2026-08-18T17:15:01.000Z",
  };

  assert.equal(
    buildPurchaseAlertText(alertArguments).includes("Продажи этого продукта выключены"),
    false,
  );
  assert.equal(
    buildPurchaseAlertText({ ...alertArguments, hasClosedSales: true }).includes(
      "Продажи этого продукта выключены",
    ),
    true,
  );
});
