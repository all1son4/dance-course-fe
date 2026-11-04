import assert from "node:assert/strict";
import test from "node:test";

import { PAYMENT_INPUTS } from "@/app/[locale]/payment/payment.constants";

test("postal code opens a keyboard that can type hyphens and letters", () => {
  const postalCode = PAYMENT_INPUTS.find((input) => input.name === "postalCode");

  assert.ok(postalCode);
  // "numeric" shows iOS's digits-only pad: no "-" for "00-950", no letters.
  assert.notEqual(postalCode.inputMode, "numeric");
  assert.equal(postalCode.autoComplete, "postal-code");
});
