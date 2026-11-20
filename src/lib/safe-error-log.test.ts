import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { logSafeError } from "./safe-error-log";

test("safe error logging never includes exception messages or custom names", () => {
  // The message is free text: only its category and a safe code («Error») remain.
  const log = mock.method(console, "error", () => undefined);

  try {
    const error = new Error("customer@example.test secret-token");
    error.name = "secret-token";
    logSafeError("checkout_failed", error);

    assert.deepEqual(log.mock.calls[0].arguments, [
      "checkout_failed",
      { errorCategory: "Error", code: "Error" },
    ]);
  } finally {
    log.mock.restore();
  }
});
