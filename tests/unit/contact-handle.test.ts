import assert from "node:assert/strict";
import test from "node:test";

import { getVisiblePaymentInputs } from "@/app/[locale]/payment/payment.helpers";
import { toAdminSearchTokens } from "@/lib/admin/search-tokens";
import { getPaymentContactField } from "@/lib/checkout/payment.constants";

const visibleNames = (isRenewalCheckout: boolean) =>
  getVisiblePaymentInputs({ isRenewalCheckout, showsLessonLanguage: false }).map(
    (input) => input.name,
  );

test("a regular checkout asks for Instagram, a verified renewal for Telegram first", () => {
  const regular = visibleNames(false);
  assert.ok(regular.includes("instagram"));
  assert.ok(!regular.includes("nickname"));

  const renewal = visibleNames(true);
  assert.equal(renewal[0], "nickname");
  assert.ok(!renewal.includes("instagram"));

  assert.equal(getPaymentContactField(""), "instagram");
  assert.equal(getPaymentContactField("rnw_abc"), "nickname");
});

test("an admin search reads handles, links and words in any order", () => {
  assert.deepEqual(toAdminSearchTokens("  @Anna.Dance  "), ["anna.dance"]);
  assert.deepEqual(toAdminSearchTokens("https://www.instagram.com/anna.dance/?hl=pl"), [
    "anna.dance",
  ]);
  assert.deepEqual(toAdminSearchTokens("t.me/anna_tg"), ["anna_tg"]);
  assert.deepEqual(toAdminSearchTokens("Kowalska  First touch"), [
    "kowalska",
    "first",
    "touch",
  ]);
  assert.deepEqual(toAdminSearchTokens("   "), []);
});
