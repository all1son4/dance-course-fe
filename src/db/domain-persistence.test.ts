import assert from "node:assert/strict";
import test from "node:test";

import {
  getDomainPersistenceConfiguration,
  getDomainPersistenceMode,
} from "./domain-persistence";

test("defaults every domain to the behavior-preserving legacy mode", () => {
  assert.deepEqual(getDomainPersistenceConfiguration({}), {
    paymentEvents: "legacy",
    sheetsExport: "legacy",
    sideEffects: "legacy",
  });
});

test("reads each domain independently", () => {
  assert.equal(
    getDomainPersistenceMode("paymentEvents", {
      DB_PAYMENT_EVENTS_MODE: "shadow",
      DB_SIDE_EFFECTS_MODE: "database",
    }),
    "shadow",
  );
  assert.equal(
    getDomainPersistenceMode("sideEffects", {
      DB_PAYMENT_EVENTS_MODE: "shadow",
      DB_SIDE_EFFECTS_MODE: "database",
    }),
    "database",
  );
});

test("rejects invalid values instead of silently falling back", () => {
  assert.throws(
    () =>
      getDomainPersistenceMode("paymentEvents", {
        DB_PAYMENT_EVENTS_MODE: "automatic-fallback",
      }),
    /DB_PAYMENT_EVENTS_MODE must be one of/u,
  );
});
