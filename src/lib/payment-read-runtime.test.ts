import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";

import {
  findPaymentAccessRecord,
  type PaymentReadDependencies,
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
  checkoutRecord = null,
  intentRecord = null,
}: {
  checkoutRecord?: PaymentSheetRecord | null;
  intentRecord?: PaymentSheetRecord | null;
} = {}): PaymentReadDependencies => ({
  database: {
    findByCheckoutSessionId: async () => checkoutRecord,
    findByPaymentIntentId: async () => intentRecord,
  },
});

test("reads payment access records only from PostgreSQL", async () => {
  const calls: string[] = [];
  const record = createPaymentRecord();
  const dependencies = createDependencies();
  dependencies.database.findByPaymentIntentId = async (paymentIntentId) => {
    calls.push(`intent:${paymentIntentId}`);
    return record;
  };
  dependencies.database.findByCheckoutSessionId = async (checkoutSessionId) => {
    calls.push(`checkout:${checkoutSessionId}`);
    return null;
  };

  const result = await findPaymentAccessRecord({
    checkoutSessionId: "cs_test",
    dependencies,
    paymentIntentId: "pi_test",
  });

  assert.equal(result, record);
  assert.deepEqual(calls, ["intent:pi_test"]);
});

test("fails closed on a database read error", async () => {
  const dependencies = createDependencies();
  dependencies.database.findByPaymentIntentId = async () => {
    throw new Error("database unavailable");
  };

  await assert.rejects(
    findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies,
      paymentIntentId: "pi_test",
    }),
    /database unavailable/u,
  );
});

test("keeps payment-intent precedence and succeeded checkout fallback", async () => {
  const checkoutRecord = createPaymentRecord({ payment_intent_id: "pi_retry" });
  const intentRecord = createPaymentRecord({ outcome: "failed" });

  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({ intentRecord }),
      paymentIntentId: "pi_test",
    }),
    intentRecord,
  );
  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({ checkoutRecord }),
      paymentIntentId: "pi_missing",
    }),
    checkoutRecord,
  );
  assert.equal(
    await findPaymentAccessRecord({
      checkoutSessionId: "cs_test",
      dependencies: createDependencies({
        checkoutRecord: createPaymentRecord({ outcome: "processing" }),
      }),
      paymentIntentId: "pi_missing",
    }),
    null,
  );
});
