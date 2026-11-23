import assert from "node:assert/strict";
import test from "node:test";

import type { OperationsQueueStatus, OperationsSnapshot } from "./admin.types";
import { buildSystems } from "./operations-view";

const idle: OperationsQueueStatus = {
  deadLetters: 0,
  oldestReadyAgeSeconds: null,
  ready: 0,
  retries: 0,
  staleLeases: 0,
  working: 0,
};

const snapshot = (overrides: Partial<OperationsSnapshot> = {}): OperationsSnapshot => ({
  access: { linkFailed: 0, manualPending: 0, pending: 0 },
  capturedAt: "2026-11-22T10:00:00.000Z",
  events: [],
  inbox: idle,
  inboxDeadLetters: [],
  outbox: idle,
  outboxDeadLetters: [],
  problemEntitlements: [],
  projection: { unlinkedProcessedEvents: 0, unverifiedEvents: 0 },
  reports: {},
  ...overrides,
});

test("four systems in a fixed order, each ok while nothing waits", () => {
  const systems = buildSystems(snapshot());

  assert.deepEqual(
    systems.map((system) => [system.key, system.state]),
    [
      ["inbox", "ok"],
      ["outbox", "ok"],
      ["access", "ok"],
      ["reports", "ok"],
    ],
  );
});

test("a queue waits past ten minutes as a warning, dead letters as a failure", () => {
  const [inbox, outbox] = buildSystems(
    snapshot({
      inbox: { ...idle, oldestReadyAgeSeconds: 601, ready: 1 },
      outbox: { ...idle, deadLetters: 2 },
    }),
  );

  assert.equal(inbox?.state, "warn");
  assert.equal(outbox?.state, "alert");
  assert.equal(outbox?.detail, "Не доставлено: 2. Ниже можно повторить доставку.");
});
