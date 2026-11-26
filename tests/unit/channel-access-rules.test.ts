import assert from "node:assert/strict";
import test from "node:test";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import {
  isIsoExpired,
  isOfferEligibleForTelegramAccessLink,
} from "@/lib/telegram/channel-access-rules";

test("a channel link goes to choreo, first-touch and lifetime offers only", () => {
  const eligible = [
    SELLABLE_PRODUCTS["choreo-still-alive"].offers[0]!.id,
    SELLABLE_PRODUCTS["choreo-still-alive"].offers[1]!.id,
    SELLABLE_PRODUCTS["first-touch"].offers[0]!.id,
    SELLABLE_PRODUCTS["choreo-birthday-drop"].offers[0]!.id,
  ];
  const notEligible = [
    ...SELLABLE_PRODUCTS["online-group-anna-strok"].offers.map((offer) => offer.id),
    ...SELLABLE_PRODUCTS["inspiration-hub"].offers.map((offer) => offer.id),
    "",
    "off_unknown",
  ];

  for (const offerId of eligible) {
    assert.equal(isOfferEligibleForTelegramAccessLink(offerId), true, offerId);
  }
  for (const offerId of notEligible) {
    assert.equal(isOfferEligibleForTelegramAccessLink(offerId), false, offerId);
  }
});

test("a timestamp is expired once it is not in the future; an unreadable one is expired", () => {
  assert.equal(isIsoExpired(new Date(Date.now() - 1_000).toISOString()), true);
  assert.equal(isIsoExpired(new Date(Date.now() + 60_000).toISOString()), false);
  assert.equal(isIsoExpired(""), true);
  assert.equal(isIsoExpired("not a date"), true);
});
