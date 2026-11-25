import assert from "node:assert/strict";
import test from "node:test";

import { withConnectionFacts } from "@/lib/error-log/server-sink";

import {
  describeDatabaseConnections,
  watchDatabaseConnections,
} from "./connection-watch";

const input = {
  area: "app" as const,
  code: "CONNECT_TIMEOUT",
  event: "Failed to answer the calendar subscription",
  reference: null,
  severity: "error" as const,
};

test("a connection failure is logged with the driver's state, other events are not", () => {
  assert.equal(describeDatabaseConnections(), null);
  watchDatabaseConnections(
    { stats: { connections: 0, opening: 4, waiting: 1 } },
    () => {},
  );

  const logged = withConnectionFacts(input).reference ?? "";
  assert.match(
    logged,
    /^запрос — · попытка — · простой — · клиент \d+ мс · подключений 0 · пул 0\/4\/1$/u,
  );
  // Fits the column the log keeps (last_reference, 120 characters).
  assert.ok(logged.length <= 120);

  assert.equal(
    withConnectionFacts({ ...input, code: "CONNECTION_CLOSED" }).reference,
    logged,
  );
  assert.equal(
    withConnectionFacts({ ...input, code: "postgres: 23514" }).reference,
    null,
  );
  assert.equal(
    withConnectionFacts({ ...input, reference: "purchase-1" }).reference,
    "purchase-1",
  );
});
