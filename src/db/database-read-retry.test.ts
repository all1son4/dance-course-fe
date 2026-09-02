import assert from "node:assert/strict";
import test from "node:test";

import {
  getDatabaseErrorCode,
  isTransientDatabaseReadError,
  retryTransientDatabaseRead,
} from "./database-read-retry";

const createWrappedError = (code: string) => {
  const cause = Object.assign(new Error(code), { code });

  return new Error("Failed query", { cause });
};

test("finds transient connection codes through database error wrappers", () => {
  const error = createWrappedError("CONNECT_TIMEOUT");

  assert.equal(getDatabaseErrorCode(error), "CONNECT_TIMEOUT");
  assert.equal(isTransientDatabaseReadError(error), true);
  assert.equal(isTransientDatabaseReadError(createWrappedError("08006")), true);
});

test("does not classify schema and authentication failures as transient", () => {
  assert.equal(isTransientDatabaseReadError(createWrappedError("42703")), false);
  assert.equal(isTransientDatabaseReadError(createWrappedError("28P01")), false);
});

test("retries a transient read once and returns the recovered result", async () => {
  let calls = 0;
  const delays: number[] = [];
  const retries: Array<{ attempt: number; errorCode: string | null }> = [];
  const result = await retryTransientDatabaseRead(
    async () => {
      calls += 1;

      if (calls === 1) {
        throw createWrappedError("CONNECTION_CLOSED");
      }

      return "recovered";
    },
    {
      delayMs: 25,
      onRetry: ({ attempt, errorCode }) => retries.push({ attempt, errorCode }),
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result, "recovered");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [25]);
  assert.deepEqual(retries, [{ attempt: 1, errorCode: "CONNECTION_CLOSED" }]);
});

test("does not retry a non-transient read failure", async () => {
  let calls = 0;
  const error = createWrappedError("42703");

  await assert.rejects(
    retryTransientDatabaseRead(async () => {
      calls += 1;
      throw error;
    }),
    (actual) => actual === error,
  );
  assert.equal(calls, 1);
});
