import assert from "node:assert/strict";
import test from "node:test";

import {
  type PurchaseTelegramIdentityEvidence,
  type PurchaseTelegramIdentitySource,
  summarizePurchaseTelegramIdentity,
} from "./purchase-telegram-identity-summary";

const purchaseId = "purchase-a";

function evidence(
  overrides: Partial<PurchaseTelegramIdentityEvidence> = {},
): PurchaseTelegramIdentityEvidence {
  return {
    purchaseId,
    source: "binding",
    sourceRecordId: "record-a",
    telegramUserId: "123",
    ...overrides,
  };
}

test("purchase identity: an empty history remains missing", () => {
  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, []), {
    purchaseId,
    status: "missing",
    telegramUserId: null,
    candidateUserIds: [],
    evidence: [],
  });
});

test("purchase identity: unknown and whitespace-only IDs remain visible but give no candidate", () => {
  const rows = [
    evidence({ sourceRecordId: "record-b", telegramUserId: " \t\n " }),
    evidence({ sourceRecordId: "record-a", telegramUserId: null }),
    evidence({ sourceRecordId: "record-c", telegramUserId: "" }),
  ];

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows), {
    purchaseId,
    status: "missing",
    telegramUserId: null,
    candidateUserIds: [],
    evidence: [rows[1], rows[0], rows[2]],
  });
});

for (const source of [
  "purchase",
  "entitlement",
  "binding",
  "used_token",
] as const satisfies readonly PurchaseTelegramIdentitySource[]) {
  test(`purchase identity: one recorded ${source} ID is consistent`, () => {
    const row = evidence({ source });

    assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, [row]), {
      purchaseId,
      status: "consistent",
      telegramUserId: "123",
      candidateUserIds: ["123"],
      evidence: [row],
    });
  });
}

test("purchase identity: matching records from every source give one trimmed candidate", () => {
  const rows = [
    evidence({ source: "purchase", telegramUserId: " 123 " }),
    evidence({ source: "entitlement", telegramUserId: "123" }),
    evidence({ source: "used_token", telegramUserId: "\t123\n" }),
    evidence({ source: "binding", telegramUserId: "123" }),
  ];

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows), {
    purchaseId,
    status: "consistent",
    telegramUserId: "123",
    candidateUserIds: ["123"],
    evidence: [rows[3], rows[1], rows[0], rows[2]],
  });
});

test("purchase identity: records from another purchase cannot supply or contradict an ID", () => {
  const own = evidence();
  const foreign = evidence({ purchaseId: "purchase-b", telegramUserId: "999" });

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, [foreign, own]), {
    purchaseId,
    status: "consistent",
    telegramUserId: "123",
    candidateUserIds: ["123"],
    evidence: [own],
  });
  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, [foreign]), {
    purchaseId,
    status: "missing",
    telegramUserId: null,
    candidateUserIds: [],
    evidence: [],
  });
});

test("purchase identity: purchase IDs match exactly without trimming or partial matches", () => {
  const rows = [
    evidence({ purchaseId: " purchase-a " }),
    evidence({ purchaseId: "purchase-a-suffix" }),
    evidence({ purchaseId: "PURCHASE-A" }),
  ];

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows), {
    purchaseId,
    status: "missing",
    telegramUserId: null,
    candidateUserIds: [],
    evidence: [],
  });
});

test("purchase identity: disagreement preserves both candidates without selecting an owner", () => {
  const rows = [
    evidence({ source: "purchase", telegramUserId: "999" }),
    evidence({ source: "binding", telegramUserId: "123" }),
  ];

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows), {
    purchaseId,
    status: "conflict",
    telegramUserId: null,
    candidateUserIds: ["123", "999"],
    evidence: [rows[1], rows[0]],
  });
});

test("purchase identity: neither majority nor source priority resolves disagreement", () => {
  const rows = [
    evidence({ source: "purchase", telegramUserId: "123" }),
    evidence({ source: "entitlement", telegramUserId: "123" }),
    evidence({ source: "binding", telegramUserId: "123" }),
    evidence({ source: "used_token", telegramUserId: "999" }),
  ];
  const summary = summarizePurchaseTelegramIdentity(purchaseId, rows);

  assert.equal(summary.status, "conflict");
  assert.equal(summary.telegramUserId, null);
  assert.deepEqual(summary.candidateUserIds, ["123", "999"]);
  assert.equal(summary.evidence.length, 4);
});

test("purchase identity: candidate IDs remain opaque strings in lexical order", () => {
  const rows = [
    evidence({ sourceRecordId: "record-c", telegramUserId: "2" }),
    evidence({ sourceRecordId: "record-a", telegramUserId: "10" }),
    evidence({ sourceRecordId: "record-b", telegramUserId: "0010" }),
  ];
  const summary = summarizePurchaseTelegramIdentity(purchaseId, rows);

  assert.equal(summary.status, "conflict");
  assert.equal(summary.telegramUserId, null);
  assert.deepEqual(summary.candidateUserIds, ["0010", "10", "2"]);
});

test("purchase identity: duplicate evidence does not multiply identity candidates or hide records", () => {
  const row = evidence();
  const summary = summarizePurchaseTelegramIdentity(purchaseId, [row, row]);

  assert.equal(summary.status, "consistent");
  assert.deepEqual(summary.candidateUserIds, ["123"]);
  assert.deepEqual(summary.evidence, [row, row]);
});

test("purchase identity: evidence order is deterministic by source and then record ID", () => {
  const rows = [
    evidence({ source: "used_token", sourceRecordId: "token-z" }),
    evidence({ source: "purchase", sourceRecordId: "purchase-a" }),
    evidence({ source: "binding", sourceRecordId: "binding-z" }),
    evidence({ source: "entitlement", sourceRecordId: "entitlement-a" }),
    evidence({ source: "binding", sourceRecordId: "binding-a" }),
  ];

  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows).evidence, [
    rows[4],
    rows[2],
    rows[3],
    rows[1],
    rows[0],
  ]);
  assert.deepEqual(
    summarizePurchaseTelegramIdentity(purchaseId, rows),
    summarizePurchaseTelegramIdentity(purchaseId, [...rows].reverse()),
  );
});

test("purchase identity: frozen inputs and original ID values are preserved", () => {
  const rows = Object.freeze([
    Object.freeze(evidence({ sourceRecordId: "record-b", telegramUserId: " 999 " })),
    Object.freeze(evidence({ sourceRecordId: "record-a", telegramUserId: "123" })),
  ]);
  const before = structuredClone(rows);
  const summary = summarizePurchaseTelegramIdentity(purchaseId, rows);

  assert.equal(summary.status, "conflict");
  assert.deepEqual(rows, before);
  assert.equal(summary.evidence[1].telegramUserId, " 999 ");
  assert.deepEqual(summary.candidateUserIds, ["123", "999"]);
});

test("purchase identity: output arrays are independent of the input and subsequent calls", () => {
  const rows = [
    evidence(),
    evidence({ sourceRecordId: "record-b", telegramUserId: "999" }),
  ];
  const first = summarizePurchaseTelegramIdentity(purchaseId, rows);
  const second = summarizePurchaseTelegramIdentity(purchaseId, rows);

  assert.notStrictEqual(first.evidence, rows);
  assert.notStrictEqual(first.evidence, second.evidence);
  assert.notStrictEqual(first.candidateUserIds, second.candidateUserIds);
  first.evidence.pop();
  first.candidateUserIds.reverse();

  assert.equal(rows.length, 2);
  assert.equal(second.evidence.length, 2);
  assert.deepEqual(second.candidateUserIds, ["123", "999"]);
  assert.deepEqual(summarizePurchaseTelegramIdentity(purchaseId, rows), second);
});
