import assert from "node:assert/strict";
import test from "node:test";

import {
  insertSuccessDate,
  resolveSuccessPageOutcomeAction,
} from "@/app/[locale]/payment/success/success-outcome";

test("[BEH-PAY-01] shows success only for a confirmed succeeded PaymentIntent", () => {
  assert.equal(resolveSuccessPageOutcomeAction("succeeded"), "show_success");
  assert.equal(resolveSuccessPageOutcomeAction("processing"), "show_pending");
  assert.equal(resolveSuccessPageOutcomeAction("requires_action"), "show_pending");
});

test("[BEH-PAY-02] keeps failed outcomes and unavailable verification distinct", () => {
  assert.equal(resolveSuccessPageOutcomeAction("failed"), "redirect_failed");
  assert.equal(resolveSuccessPageOutcomeAction("canceled"), "redirect_failed");
  assert.equal(resolveSuccessPageOutcomeAction(undefined), "verification_unavailable");
});

test("a Russian date ending a sentence keeps one full stop", () => {
  const template = "Inspiration Hub откроется со стартом потока, {date}. В этот день…";
  assert.equal(
    insertSuccessDate(template, "23 ноября 2026 г."),
    "Inspiration Hub откроется со стартом потока, 23 ноября 2026 г. В этот день…",
  );
  assert.equal(
    insertSuccessDate("Opens on {date}. That day…", "23 November 2026"),
    "Opens on 23 November 2026. That day…",
  );
  assert.equal(
    insertSuccessDate("с {date}, в 18:00", "23 ноября 2026 г."),
    "с 23 ноября 2026 г., в 18:00",
  );
});
