import assert from "node:assert/strict";
import test from "node:test";

import type { StripeInboxReadModel } from "@/db/stripe-event-inbox";
import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  findPaymentAccessRecord,
  getPaymentReadRuntime,
  observeStripeEventReadShadow,
  type PaymentReadDependencies,
  type PaymentReadShadowComparison,
} from "./payment-read-runtime";

const createPaymentRecord = (
  overrides: Partial<PaymentSheetRecord> = {},
): PaymentSheetRecord => ({
  ...(Object.fromEntries(
    PAYMENT_SHEET_HEADERS.map((header) => [header, ""]),
  ) as PaymentSheetRecord),
  amount: "1000",
  checkout_session_id: "cs_test",
  currency: "pln",
  first_seen_at: "2026-08-13T08:00:00.000Z",
  outcome: "succeeded",
  payment_intent_id: "pi_test",
  status: "succeeded",
  ...overrides,
});

const createDependencies = ({
  databaseCheckout = null,
  databaseIntent = null,
  databaseStripeEvent = null,
  legacyCheckout = null,
  legacyIntent = null,
  sheetsCheckout = null,
  sheetsIntent = null,
}: {
  databaseCheckout?: PaymentSheetRecord | null;
  databaseIntent?: PaymentSheetRecord | null;
  databaseStripeEvent?: StripeInboxReadModel | null;
  legacyCheckout?: PaymentSheetRecord | null;
  legacyIntent?: PaymentSheetRecord | null;
  sheetsCheckout?: PaymentSheetRecord | null;
  sheetsIntent?: PaymentSheetRecord | null;
} = {}): PaymentReadDependencies => ({
  database: {
    findByCheckoutSessionId: async () => databaseCheckout,
    findByPaymentIntentId: async () => databaseIntent,
    findStripeEvent: async () => databaseStripeEvent,
  },
  legacy: {
    findByCheckoutSessionId: async () => legacyCheckout,
    findByPaymentIntentId: async () => legacyIntent,
  },
  sheets: {
    findByCheckoutSessionId: async () => sheetsCheckout,
    findByPaymentIntentId: async () => sheetsIntent,
  },
});

test("selects the payment read runtime from the payment-events flag", () => {
  assert.equal(getPaymentReadRuntime({}), "legacy");
  assert.equal(getPaymentReadRuntime({ DB_PAYMENT_EVENTS_MODE: "shadow" }), "shadow");
  assert.equal(getPaymentReadRuntime({ DB_PAYMENT_EVENTS_MODE: "database" }), "database");
  assert.throws(
    () => getPaymentReadRuntime({ DB_PAYMENT_EVENTS_MODE: "unexpected" }),
    /DB_PAYMENT_EVENTS_MODE must be one of/u,
  );
});

test("database mode never falls back to legacy or Sheets", async () => {
  let legacyCalls = 0;
  let sheetsCalls = 0;
  const dependencies = createDependencies();
  dependencies.legacy.findByPaymentIntentId = async () => {
    legacyCalls += 1;
    return createPaymentRecord();
  };
  dependencies.sheets.findByPaymentIntentId = async () => {
    sheetsCalls += 1;
    return createPaymentRecord();
  };

  const result = await findPaymentAccessRecord({
    checkoutSessionId: "cs_missing",
    dependencies,
    environment: { DB_PAYMENT_EVENTS_MODE: "database" },
    paymentIntentId: "pi_missing",
  });

  assert.equal(result, null);
  assert.equal(legacyCalls, 0);
  assert.equal(sheetsCalls, 0);
});

test("database mode fails closed on a database read error", async () => {
  let legacyCalls = 0;
  const dependencies = createDependencies();
  dependencies.database.findByPaymentIntentId = async () => {
    throw new Error("database unavailable");
  };
  dependencies.legacy.findByPaymentIntentId = async () => {
    legacyCalls += 1;
    return createPaymentRecord();
  };

  await assert.rejects(
    findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies,
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: "pi_test",
    }),
    /database unavailable/u,
  );
  assert.equal(legacyCalls, 0);
});

test("keeps payment-intent precedence and succeeded checkout fallback", async () => {
  const checkoutRecord = createPaymentRecord({ payment_intent_id: "pi_retry" });
  const intentRecord = createPaymentRecord({ outcome: "failed" });

  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({ databaseIntent: intentRecord }),
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: "pi_test",
    }),
    intentRecord,
  );
  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({ databaseCheckout: checkoutRecord }),
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: "pi_missing",
    }),
    checkoutRecord,
  );
  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({
        databaseCheckout: createPaymentRecord({ outcome: "processing" }),
      }),
      environment: { DB_PAYMENT_EVENTS_MODE: "database" },
      paymentIntentId: "pi_missing",
    }),
    null,
  );
});

test("shadow mode returns the legacy result and emits only sanitized drift metadata", async () => {
  const primaryRecord = createPaymentRecord({ customer_full_name: "Primary result" });
  const databaseRecord = createPaymentRecord({
    customer_email: "CUSTOMER@EXAMPLE.COM",
    customer_full_name: "Database value",
    first_seen_at: "2026-08-13T08:00:00.850Z",
  });
  const sheetsRecord = createPaymentRecord({
    customer_email: "customer@example.com",
    customer_full_name: "Sheets value",
    first_seen_at: "2026-08-13T08:00:00.100Z",
  });
  const comparisons: PaymentReadShadowComparison[] = [];

  const result = await findPaymentAccessRecord({
    checkoutSessionId: "cs_test",
    dependencies: createDependencies({
      databaseIntent: databaseRecord,
      legacyIntent: primaryRecord,
      sheetsIntent: sheetsRecord,
    }),
    environment: { DB_PAYMENT_EVENTS_MODE: "shadow" },
    onShadowComparison: (comparison) => comparisons.push(comparison),
    paymentIntentId: "pi_test",
  });

  assert.equal(result, primaryRecord);
  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].status, "mismatch");
  assert.deepEqual(comparisons[0].differingFields, ["customer_full_name"]);
  assert.match(comparisons[0].keyHash, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(comparisons[0]), /Database value|Sheets value/u);
});

test("shadow comparison failures never change the legacy result", async (t) => {
  const primaryRecord = createPaymentRecord();
  const dependencies = createDependencies({ legacyIntent: primaryRecord });
  dependencies.database.findByPaymentIntentId = async () => {
    throw new Error("database shadow unavailable");
  };
  t.mock.method(console, "warn", () => undefined);

  const result = await findPaymentAccessRecord({
    checkoutSessionId: "cs_test",
    dependencies,
    environment: { DB_PAYMENT_EVENTS_MODE: "shadow" },
    paymentIntentId: "pi_test",
  });

  assert.equal(result, primaryRecord);
});

test("Stripe event shadow reads understand inbox finality", async () => {
  const comparisons: PaymentReadShadowComparison[] = [];
  const pendingEvent: StripeInboxReadModel = {
    eventType: "payment_intent.succeeded",
    outcome: null,
    paymentIntentId: null,
    paymentStatus: null,
    processingStatus: "pending",
    stripeEventId: "evt_test",
  };

  await observeStripeEventReadShadow({
    dependencies: createDependencies({ databaseStripeEvent: pendingEvent }),
    environment: { DB_PAYMENT_EVENTS_MODE: "shadow" },
    eventId: "evt_test",
    onShadowComparison: (comparison) => comparisons.push(comparison),
    sheetsRecord: null,
  });
  assert.equal(comparisons[0].status, "match");

  await observeStripeEventReadShadow({
    dependencies: createDependencies({
      databaseStripeEvent: {
        ...pendingEvent,
        outcome: "succeeded",
        paymentIntentId: "pi_test",
        paymentStatus: "succeeded",
        processingStatus: "processed",
      },
    }),
    environment: { DB_PAYMENT_EVENTS_MODE: "shadow" },
    eventId: "evt_test",
    onShadowComparison: (comparison) => comparisons.push(comparison),
    sheetsRecord: {
      event_id: "evt_test",
      event_type: "payment_intent.succeeded",
      outcome: "succeeded",
      payment_intent_id: "pi_test",
      processed_at: "2026-08-13T08:00:01.000Z",
      status: "processing",
    },
  });

  assert.equal(comparisons[1].status, "mismatch");
  assert.deepEqual(comparisons[1].differingFields, ["status"]);
});
