import assert from "node:assert/strict";
import test from "node:test";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { createEmptyPaymentRecord } from "@/lib/payment-record";
import { isStandardTelegramLinkPayment } from "@/lib/telegram/access";

const record = (offerId: string, accessWorkflow = "") => ({
  ...createEmptyPaymentRecord(),
  access_workflow: accessWorkflow,
  offer_id: offerId,
});

test("an eligible offer gets the ordinary link unless it is handed out by hand", () => {
  const choreo = SELLABLE_PRODUCTS["choreo-still-alive"].offers[0]!.id;
  const firstTouch = SELLABLE_PRODUCTS["first-touch"].offers[0]!.id;
  const onlineGroup = SELLABLE_PRODUCTS["online-group-anna-strok"].offers[0]!.id;

  assert.equal(isStandardTelegramLinkPayment(record(choreo, "telegram-bot")), true);
  assert.equal(isStandardTelegramLinkPayment(record(firstTouch)), true);
  assert.equal(isStandardTelegramLinkPayment(record(choreo, " manual-admin ")), false);
  assert.equal(isStandardTelegramLinkPayment(record(onlineGroup)), false);
});
