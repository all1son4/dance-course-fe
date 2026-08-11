import assert from "node:assert/strict";
import test from "node:test";

import { getStripeWriteRuntime } from "./write-runtime";

test("keeps the current synchronous runtime until both write domains cut over", () => {
  assert.equal(getStripeWriteRuntime({}), "legacy");
  assert.equal(
    getStripeWriteRuntime({
      DB_PAYMENT_EVENTS_MODE: "shadow",
      DB_SIDE_EFFECTS_MODE: "legacy",
    }),
    "legacy",
  );
});

test("enables async inbox and outbox only when both domains use the database", () => {
  assert.equal(
    getStripeWriteRuntime({
      DB_PAYMENT_EVENTS_MODE: "database",
      DB_SIDE_EFFECTS_MODE: "database",
    }),
    "database",
  );
});

test("fails closed when only one Stripe write domain is switched", () => {
  assert.throws(
    () =>
      getStripeWriteRuntime({
        DB_PAYMENT_EVENTS_MODE: "database",
        DB_SIDE_EFFECTS_MODE: "shadow",
      }),
    /stripe_write_modes_must_switch_together/u,
  );
});
