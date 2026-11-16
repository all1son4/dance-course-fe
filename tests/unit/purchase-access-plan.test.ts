import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchaseAlertText } from "@/app/api/stripe/webhook/_lib/purchase-alert";
import {
  getPurchaseAccessPlan,
  isRejectedPurchaseAccessError,
  needsPurchaseAccessJob,
} from "@/app/api/stripe/webhook/_lib/side-effects/purchase-access";
import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { createEmptyPaymentRecord } from "@/lib/payment-record";

const [STANDARD_OFFER] = SELLABLE_PRODUCTS["online-group-anna-strok"].offers;
const FIRST_TOUCH_OFFER_ID = SELLABLE_PRODUCTS["first-touch"].offers[0].id;

test("the access job is queued for Hub and Online Group purchases only", () => {
  assert.equal(needsPurchaseAccessJob(INSPIRATION_HUB_ACCESS_OFFER_ID), true);
  assert.equal(needsPurchaseAccessJob(INSPIRATION_HUB_RENEWAL_OFFER_ID), true);
  assert.equal(needsPurchaseAccessJob(STANDARD_OFFER.id), true);
  assert.equal(needsPurchaseAccessJob(ONLINE_GROUP_RENEWAL_OFFER_ID), true);
  assert.equal(needsPurchaseAccessJob(FIRST_TOUCH_OFFER_ID), false);
});

test("a discounted Hub continues the cohort whose chat granted the discount", () => {
  assert.deepEqual(
    getPurchaseAccessPlan({
      offerId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
      metadata: {
        hub_discount_basis: "cohort_chat",
        hub_discount_cohort_id: "cohort-2",
        telegram_user_id: " 123 ",
      },
    }),
    {
      kind: "inspiration_hub",
      continuationCohortId: "cohort-2",
      verifiedTelegramUserId: "123",
    },
  );
  assert.deepEqual(
    getPurchaseAccessPlan({
      offerId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
      metadata: {
        hub_discount_basis: "active_hub",
        hub_discount_cohort_id: "cohort-2",
        telegram_user_id: "123",
      },
    }),
    {
      kind: "inspiration_hub",
      continuationCohortId: null,
      verifiedTelegramUserId: "123",
    },
  );
  assert.deepEqual(
    getPurchaseAccessPlan({ offerId: INSPIRATION_HUB_ACCESS_OFFER_ID, metadata: {} }),
    { kind: "inspiration_hub", continuationCohortId: null, verifiedTelegramUserId: null },
  );
});

test("an Online payment names its cohort; one from before cohorts stays legacy", () => {
  assert.deepEqual(
    getPurchaseAccessPlan({
      offerId: ONLINE_GROUP_RENEWAL_OFFER_ID,
      metadata: { online_group_cohort_id: "cohort-3", telegram_user_id: "123" },
    }),
    { kind: "online_group", cohortId: "cohort-3", verifiedTelegramUserId: "123" },
  );
  assert.deepEqual(getPurchaseAccessPlan({ offerId: STANDARD_OFFER.id, metadata: {} }), {
    kind: "none",
  });
  assert.deepEqual(
    getPurchaseAccessPlan({
      offerId: FIRST_TOUCH_OFFER_ID,
      metadata: { online_group_cohort_id: "cohort-3" },
    }),
    { kind: "none" },
  );
});

test("only lock conflicts of the access job are retried", () => {
  for (const message of [
    "hub_period_chain_invalid",
    "hub_period_selection_ambiguous",
    "hub_purchase_period_invalid",
    "purchase_access_cohort_conflict",
  ]) {
    assert.equal(isRejectedPurchaseAccessError(new Error(message)), true, message);
  }
  for (const message of [
    "hub_period_chain_read_conflict",
    "hub_period_chain_write_conflict",
    "hub_payment_period_write_conflict",
    "connection terminated",
  ]) {
    assert.equal(isRejectedPurchaseAccessError(new Error(message)), false, message);
  }
  assert.equal(
    isRejectedPurchaseAccessError(Object.assign(new Error("hub_x"), { code: "40001" })),
    false,
  );
});

test("a rejected access job is named in the purchase alert", () => {
  const alertText = buildPurchaseAlertText({
    eventCreatedAtIso: "2026-11-16T09:00:00.000Z",
    eventId: "evt_test",
    eventType: "payment_intent.succeeded",
    paymentRecord: {
      ...createEmptyPaymentRecord(),
      amount: "4000",
      checkout_currency: "eur",
      email_delivery_status: "sent",
      offer_id: INSPIRATION_HUB_ACCESS_OFFER_ID,
      outcome: "succeeded",
      payment_intent_id: "pi_test",
      status: "succeeded",
    },
    processedAtIso: "2026-11-16T09:00:05.000Z",
    rejectedAccessReason: "hub_purchase_period_invalid",
  });

  assert.match(alertText, /Срок доступа: не записан: hub_purchase_period_invalid/u);
});
