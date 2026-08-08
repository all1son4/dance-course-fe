import assert from "node:assert/strict";
import test from "node:test";

import { resolveSuccessPageOutcomeAction } from "@/app/[locale]/payment/success/success-outcome";

test("shows success only for a confirmed succeeded PaymentIntent", () => {
  assert.equal(resolveSuccessPageOutcomeAction("succeeded"), "show_success");
  assert.equal(resolveSuccessPageOutcomeAction("processing"), "show_pending");
  assert.equal(resolveSuccessPageOutcomeAction("requires_action"), "show_pending");
});

test("keeps failed outcomes and unavailable verification distinct", () => {
  assert.equal(resolveSuccessPageOutcomeAction("failed"), "redirect_failed");
  assert.equal(resolveSuccessPageOutcomeAction("canceled"), "redirect_failed");
  assert.equal(resolveSuccessPageOutcomeAction(undefined), "verification_unavailable");
});
