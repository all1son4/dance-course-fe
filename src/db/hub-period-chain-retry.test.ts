import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as flushContinuations } from "node:timers/promises";

import type { HubPeriodChainPlan } from "@/lib/inspiration-hub/period-chain";

import {
  isRetryableHubPeriodChainError,
  retryHubPeriodChainTransaction,
} from "./hub-period-chain-retry";

for (const message of [
  "hub_period_chain_read_conflict",
  "hub_period_chain_write_conflict",
]) {
  test(`a direct ${message} permits a new transaction`, () => {
    const error = new Error(message);
    assert.equal(isRetryableHubPeriodChainError(error), true);
    assert.equal(error.message, message);
  });
}

for (const code of ["40001", "40P01"]) {
  for (const wrapped of [false, true]) {
    test(`${wrapped ? "wrapped" : "direct"} SQLSTATE ${code} permits retry without parsing its message`, () => {
      const cause = Object.assign(new Error("Localized database message"), { code });
      const error = wrapped
        ? new Error("Failed query", { cause: new Error("Transaction failed", { cause }) })
        : cause;
      assert.equal(isRetryableHubPeriodChainError(error), true);
      assert.equal(cause.code, code);
    });
  }
}

test("the existing extractor handles errno, whitespace and case", () => {
  const error = new Error("Failed query", { cause: { errno: " 40p01 " } });
  assert.equal(isRetryableHubPeriodChainError(error), true);
});

for (const code of [
  "23505",
  "23503",
  "23514",
  "22P02",
  "55P03",
  "57014",
  "25P02",
  "28P01",
  "42703",
  "53300",
  "57P01",
  "08006",
  "08007",
  "08P01",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "ECONNRESET",
]) {
  test(`code ${code} forbids retry even with a matching conflict message`, () => {
    const error = new Error("hub_period_chain_read_conflict", {
      cause: Object.assign(new Error("Driver error"), { code }),
    });
    assert.equal(isRetryableHubPeriodChainError(error), false);
  });
}

for (const message of [
  "hub_period_chain_invalid",
  "hub_period_predecessor_invalid",
  "hub_period_chain_read_conflict_extra",
  "prefix hub_period_chain_write_conflict",
  "hub_period_chain_read_conflict ",
  "40001",
  "40P01",
  "Unknown failure",
]) {
  test(`message ${JSON.stringify(message)} alone does not permit retry`, () => {
    assert.equal(isRetryableHubPeriodChainError(new Error(message)), false);
  });
}

for (const value of [
  null,
  undefined,
  false,
  40001,
  "40001",
  "hub_period_chain_read_conflict",
  { message: "hub_period_chain_write_conflict" },
]) {
  test(`non-error input ${JSON.stringify(value)} does not permit retry or throw`, () => {
    assert.equal(isRetryableHubPeriodChainError(value), false);
  });
}

test("a business-conflict message inside an unrelated wrapper is not inferred", () => {
  const error = new Error("Unrelated wrapper", {
    cause: new Error("hub_period_chain_read_conflict"),
  });
  assert.equal(isRetryableHubPeriodChainError(error), false);
});

test("a cyclic cause terminates safely without mutating the error", () => {
  const error = new Error("Unrecognized error");
  error.cause = error;
  assert.equal(isRetryableHubPeriodChainError(error), false);
  assert.strictEqual(error.cause, error);
});

const PLAN: HubPeriodChainPlan = {
  updates: [],
  waitingEntitlementIds: ["awaiting-period"],
};

type RetryObservation = {
  status: "pending" | "fulfilled" | "rejected";
  value: HubPeriodChainPlan | null;
  error: unknown;
};

function observeRetry(runAttempt: () => Promise<HubPeriodChainPlan>): RetryObservation {
  const observation: RetryObservation = {
    status: "pending",
    value: null,
    error: undefined,
  };
  // Attach both handlers immediately, including when a test advances virtual time.
  void retryHubPeriodChainTransaction(runAttempt).then(
    (value) => {
      observation.status = "fulfilled";
      observation.value = value;
    },
    (error: unknown) => {
      observation.status = "rejected";
      observation.error = error;
    },
  );
  return observation;
}

async function advance(context: TestContext, milliseconds: number): Promise<void> {
  context.mock.timers.tick(milliseconds);
  // setImmediate is not mocked: drain Promise continuations before the next tick.
  await flushContinuations();
}

type RetryFailureKind = "read conflict" | "write conflict" | "serialization" | "deadlock";

function retryFailure(kind: RetryFailureKind, attempt: number): Error {
  if (kind === "read conflict" || kind === "write conflict") {
    return Object.assign(
      new Error(
        kind === "read conflict"
          ? "hub_period_chain_read_conflict"
          : "hub_period_chain_write_conflict",
      ),
      { attempt },
    );
  }
  return new Error(`Failed query on attempt ${attempt}`, {
    cause: Object.assign(new Error("Driver error"), {
      code: kind === "serialization" ? "40001" : "40P01",
    }),
  });
}

test("first-attempt success returns the same plan without waiting or repeating", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const observed = observeRetry(async () => {
    calls += 1;
    return PLAN;
  });
  await flushContinuations();
  assert.equal(observed.status, "fulfilled");
  assert.strictEqual(observed.value, PLAN);
  assert.equal(calls, 1);
  await advance(context, 1000);
  assert.equal(calls, 1);
});

for (const kind of [
  "read conflict",
  "write conflict",
  "serialization",
  "deadlock",
] as const) {
  for (const failures of [1, 2]) {
    test(`${kind} recovers on attempt ${failures + 1} after exact 100/200ms waits`, async (context) => {
      context.mock.timers.enable({ apis: ["setTimeout"] });
      let calls = 0;
      const observed = observeRetry(async () => {
        calls += 1;
        if (calls <= failures) throw retryFailure(kind, calls);
        return PLAN;
      });
      await flushContinuations();
      assert.equal(calls, 1);
      assert.equal(observed.status, "pending");
      await advance(context, 99);
      assert.equal(calls, 1);
      await advance(context, 1);
      assert.equal(calls, 2);
      if (failures === 2) {
        assert.equal(observed.status, "pending");
        await advance(context, 199);
        assert.equal(calls, 2);
        await advance(context, 1);
        assert.equal(calls, 3);
      }
      assert.equal(observed.status, "fulfilled");
      assert.strictEqual(observed.value, PLAN);
      await advance(context, 1000);
      assert.equal(calls, failures + 1);
    });
  }

  test(`${kind} stops after three failures and preserves the last error without a final wait`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const errors = [retryFailure(kind, 1), retryFailure(kind, 2), retryFailure(kind, 3)];
    let calls = 0;
    const observed = observeRetry(async () => {
      const error = errors[calls];
      calls += 1;
      throw error;
    });
    await flushContinuations();
    await advance(context, 100);
    assert.equal(calls, 2);
    assert.equal(observed.status, "pending");
    await advance(context, 200);
    assert.equal(calls, 3);
    assert.equal(observed.status, "rejected");
    assert.strictEqual(observed.error, errors[2]);
    if (observed.error instanceof Error)
      assert.strictEqual(observed.error.cause, errors[2].cause);
    await advance(context, 10000);
    assert.equal(calls, 3);
  });
}

const permanentFailures: { name: string; error: unknown }[] = [
  { name: "invalid history", error: new Error("hub_period_chain_invalid") },
  { name: "invalid predecessor", error: new Error("hub_period_predecessor_invalid") },
  {
    name: "unique constraint",
    error: Object.assign(new Error("Unique violation"), { code: "23505" }),
  },
  {
    name: "connection loss",
    error: Object.assign(new Error("Connection lost"), { code: "ECONNRESET" }),
  },
  {
    name: "connection outcome unknown",
    error: Object.assign(new Error("Unknown outcome"), { code: "08007" }),
  },
  {
    name: "conflict message with a permanent code",
    error: Object.assign(new Error("hub_period_chain_read_conflict"), { code: "23514" }),
  },
  { name: "plain object", error: { message: "hub_period_chain_read_conflict" } },
  { name: "string", error: "hub_period_chain_read_conflict" },
  { name: "null", error: null },
  { name: "undefined", error: undefined },
];

for (const { name, error } of permanentFailures) {
  test(`${name} escapes on the first attempt unchanged and without delay`, async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let calls = 0;
    const observed = observeRetry(async () => {
      calls += 1;
      throw error;
    });
    await flushContinuations();
    assert.equal(observed.status, "rejected");
    assert.strictEqual(observed.error, error);
    assert.equal(calls, 1);
    await advance(context, 1000);
    assert.equal(calls, 1);
  });
}

test("a permanent second failure stops immediately without a third attempt", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const finalError = new Error("hub_period_predecessor_invalid");
  let calls = 0;
  const observed = observeRetry(async () => {
    calls += 1;
    if (calls === 1) throw retryFailure("read conflict", 1);
    throw finalError;
  });
  await flushContinuations();
  await advance(context, 100);
  assert.equal(calls, 2);
  assert.equal(observed.status, "rejected");
  assert.strictEqual(observed.error, finalError);
  await advance(context, 1000);
  assert.equal(calls, 2);
});

test("a deferred rejection is awaited before the retry delay starts", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const firstAttempt = Promise.withResolvers<HubPeriodChainPlan>();
  let calls = 0;
  const observed = observeRetry(() => {
    calls += 1;
    return calls === 1 ? firstAttempt.promise : Promise.resolve(PLAN);
  });
  await advance(context, 1000);
  assert.equal(calls, 1);
  assert.equal(observed.status, "pending");
  firstAttempt.reject(retryFailure("write conflict", 1));
  await flushContinuations();
  await advance(context, 99);
  assert.equal(calls, 1);
  await advance(context, 1);
  assert.equal(calls, 2);
  assert.equal(observed.status, "fulfilled");
  assert.strictEqual(observed.value, PLAN);
});
