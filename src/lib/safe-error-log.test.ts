import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { logSafeError } from "./safe-error-log";

test("safe error logging never includes exception messages or custom names", () => {
  const log = mock.method(console, "error", () => undefined);

  try {
    const error = new Error("customer@example.test secret-token");
    error.name = "secret-token";
    logSafeError("checkout_failed", error);

    assert.deepEqual(log.mock.calls[0].arguments, [
      "checkout_failed",
      { errorCategory: "Error" },
    ]);
  } finally {
    log.mock.restore();
  }
});
