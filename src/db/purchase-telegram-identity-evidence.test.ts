import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPurchaseTelegramIdentityEvidence,
  type PurchaseTelegramIdentityEvidenceInput,
  type PurchaseTelegramTokenIssueCode,
} from "./purchase-telegram-identity-evidence";
import { summarizePurchaseTelegramIdentity } from "./purchase-telegram-identity-summary";

const purchaseId = "purchase-a";
const usedAt = new Date("2026-09-01T10:00:00Z");
type TokenRow = PurchaseTelegramIdentityEvidenceInput["tokens"][number];

function input(
  overrides: Partial<PurchaseTelegramIdentityEvidenceInput> = {},
): PurchaseTelegramIdentityEvidenceInput {
  return { purchases: [], entitlements: [], bindings: [], tokens: [], ...overrides };
}

function token(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: "token-a",
    purchaseId,
    status: "used",
    usedAt,
    telegramUserId: "123",
    ...overrides,
  };
}

test("identity evidence: empty input returns two empty lists", () => {
  assert.deepEqual(buildPurchaseTelegramIdentityEvidence(input()), {
    evidence: [],
    tokenIssues: [],
  });
});

test("identity evidence: purchase, entitlement and binding records keep their distinct source IDs", () => {
  assert.deepEqual(
    buildPurchaseTelegramIdentityEvidence(
      input({
        purchases: [{ id: "purchase-z", telegramUserId: "123" }],
        entitlements: [{ id: "right-a", purchaseId, telegramUserId: "456" }],
        bindings: [{ id: "binding-a", purchaseId, telegramUserId: "789" }],
      }),
    ),
    {
      evidence: [
        {
          purchaseId,
          source: "binding",
          sourceRecordId: "binding-a",
          telegramUserId: "789",
        },
        {
          purchaseId,
          source: "entitlement",
          sourceRecordId: "right-a",
          telegramUserId: "456",
        },
        {
          purchaseId: "purchase-z",
          source: "purchase",
          sourceRecordId: "purchase-z",
          telegramUserId: "123",
        },
      ],
      tokenIssues: [],
    },
  );
});

test("identity evidence: null, blank and padded IDs from non-token records are preserved verbatim", () => {
  assert.deepEqual(
    buildPurchaseTelegramIdentityEvidence(
      input({
        purchases: [{ id: purchaseId, telegramUserId: null }],
        entitlements: [{ id: "right-a", purchaseId, telegramUserId: "   " }],
        bindings: [{ id: "binding-a", purchaseId, telegramUserId: " 123 " }],
      }),
    ),
    {
      evidence: [
        {
          purchaseId,
          source: "binding",
          sourceRecordId: "binding-a",
          telegramUserId: " 123 ",
        },
        {
          purchaseId,
          source: "entitlement",
          sourceRecordId: "right-a",
          telegramUserId: "   ",
        },
        {
          purchaseId,
          source: "purchase",
          sourceRecordId: purchaseId,
          telegramUserId: null,
        },
      ],
      tokenIssues: [],
    },
  );
});

test("identity evidence: a missing parent purchase does not hide related facts or token issues", () => {
  const result = buildPurchaseTelegramIdentityEvidence(
    input({
      entitlements: [{ id: "right-a", purchaseId, telegramUserId: "123" }],
      bindings: [{ id: "binding-a", purchaseId: "purchase-b", telegramUserId: "456" }],
      tokens: [token({ purchaseId: "purchase-c", usedAt: null })],
    }),
  );

  assert.deepEqual(result.evidence, [
    {
      purchaseId,
      source: "entitlement",
      sourceRecordId: "right-a",
      telegramUserId: "123",
    },
    {
      purchaseId: "purchase-b",
      source: "binding",
      sourceRecordId: "binding-a",
      telegramUserId: "456",
    },
  ]);
  assert.deepEqual(result.tokenIssues, [
    {
      purchaseId: "purchase-c",
      tokenRecordId: "token-a",
      code: "token_use_timestamp_missing",
    },
  ]);
});

const tokenCases: readonly {
  name: string;
  row: TokenRow;
  included: boolean;
  issues: readonly PurchaseTelegramTokenIssueCode[];
}[] = [
  {
    name: "used with a date and a padded ID",
    row: token({ telegramUserId: " 123 " }),
    included: true,
    issues: [],
  },
  {
    name: "revoked after recorded use",
    row: token({ status: "revoked" }),
    included: true,
    issues: [],
  },
  {
    name: "expired after recorded use",
    row: token({ status: "expired" }),
    included: true,
    issues: [],
  },
  {
    name: "issued with a prebound ID but no use date",
    row: token({ status: "issued", usedAt: null }),
    included: false,
    issues: [],
  },
  {
    name: "revoked without recorded use",
    row: token({ status: "revoked", usedAt: null }),
    included: false,
    issues: [],
  },
  {
    name: "expired without use or an ID",
    row: token({ status: "expired", usedAt: null, telegramUserId: null }),
    included: false,
    issues: [],
  },
  {
    name: "used without its use date",
    row: token({ usedAt: null }),
    included: false,
    issues: ["token_use_timestamp_missing"],
  },
  {
    name: "issued despite a recorded use date",
    row: token({ status: "issued" }),
    included: false,
    issues: ["token_use_status_conflict"],
  },
  {
    name: "recorded use without an ID",
    row: token({ telegramUserId: null }),
    included: false,
    issues: ["token_use_user_id_missing"],
  },
  {
    name: "used without both date and ID",
    row: token({ usedAt: null, telegramUserId: " \t " }),
    included: false,
    issues: ["token_use_timestamp_missing", "token_use_user_id_missing"],
  },
  {
    name: "issued with a use date but no ID",
    row: token({ status: "issued", telegramUserId: "" }),
    included: false,
    issues: ["token_use_status_conflict", "token_use_user_id_missing"],
  },
];

for (const { name, row, included, issues } of tokenCases) {
  test(`identity evidence: ${name}`, () => {
    assert.deepEqual(buildPurchaseTelegramIdentityEvidence(input({ tokens: [row] })), {
      evidence: included
        ? [
            {
              purchaseId: row.purchaseId,
              source: "used_token",
              sourceRecordId: row.id,
              telegramUserId: row.telegramUserId,
            },
          ]
        : [],
      tokenIssues: issues.map((code) => ({
        purchaseId: row.purchaseId,
        tokenRecordId: row.id,
        code,
      })),
    });
  });
}

test("identity evidence: the existing summary preserves a conflict between recorded sources", () => {
  const result = buildPurchaseTelegramIdentityEvidence(
    input({
      purchases: [{ id: purchaseId, telegramUserId: "123" }],
      bindings: [{ id: "binding-a", purchaseId, telegramUserId: "999" }],
    }),
  );
  const summary = summarizePurchaseTelegramIdentity(purchaseId, result.evidence);

  assert.equal(summary.status, "conflict");
  assert.equal(summary.telegramUserId, null);
  assert.deepEqual(summary.candidateUserIds, ["123", "999"]);
});

test("identity evidence: a prebound unused invite does not manufacture an identity conflict", () => {
  const result = buildPurchaseTelegramIdentityEvidence(
    input({
      purchases: [{ id: purchaseId, telegramUserId: "123" }],
      tokens: [
        token(),
        token({ id: "token-b", status: "issued", usedAt: null, telegramUserId: "999" }),
      ],
    }),
  );
  const summary = summarizePurchaseTelegramIdentity(purchaseId, result.evidence);

  assert.equal(summary.status, "consistent");
  assert.equal(summary.telegramUserId, "123");
  assert.equal(summary.evidence.length, 2);
  assert.deepEqual(result.tokenIssues, []);
});

test("identity evidence: ordering is independent of table input order for both output lists", () => {
  const source = input({
    purchases: [
      { id: "purchase-b", telegramUserId: "456" },
      { id: purchaseId, telegramUserId: "123" },
    ],
    entitlements: [
      { id: "right-z", purchaseId, telegramUserId: "123" },
      { id: "right-a", purchaseId, telegramUserId: "123" },
    ],
    bindings: [
      { id: "binding-z", purchaseId, telegramUserId: "123" },
      { id: "binding-a", purchaseId, telegramUserId: "123" },
    ],
    tokens: [
      token({ id: "token-z", usedAt: null, telegramUserId: null }),
      token({ id: "token-a", purchaseId: "purchase-b", status: "issued" }),
      token({ id: "token-b", usedAt: null }),
      token({ id: "token-used-z" }),
      token({ id: "token-used-a" }),
    ],
  });
  const result = buildPurchaseTelegramIdentityEvidence(source);
  const reversed = input({
    purchases: [...source.purchases].reverse(),
    entitlements: [...source.entitlements].reverse(),
    bindings: [...source.bindings].reverse(),
    tokens: [...source.tokens].reverse(),
  });

  assert.deepEqual(result, buildPurchaseTelegramIdentityEvidence(reversed));
  assert.deepEqual(
    result.evidence.map((row) => [row.purchaseId, row.source, row.sourceRecordId]),
    [
      [purchaseId, "binding", "binding-a"],
      [purchaseId, "binding", "binding-z"],
      [purchaseId, "entitlement", "right-a"],
      [purchaseId, "entitlement", "right-z"],
      [purchaseId, "purchase", purchaseId],
      [purchaseId, "used_token", "token-used-a"],
      [purchaseId, "used_token", "token-used-z"],
      ["purchase-b", "purchase", "purchase-b"],
    ],
  );
  assert.deepEqual(result.tokenIssues, [
    { purchaseId, tokenRecordId: "token-b", code: "token_use_timestamp_missing" },
    { purchaseId, tokenRecordId: "token-z", code: "token_use_timestamp_missing" },
    { purchaseId, tokenRecordId: "token-z", code: "token_use_user_id_missing" },
    {
      purchaseId: "purchase-b",
      tokenRecordId: "token-a",
      code: "token_use_status_conflict",
    },
  ]);
});

test("identity evidence: frozen rows, arrays and original dates remain unchanged", () => {
  const source = Object.freeze(
    input({
      purchases: Object.freeze([
        Object.freeze({ id: purchaseId, telegramUserId: " 123 " }),
      ]),
      tokens: Object.freeze([Object.freeze(token())]),
    }),
  );
  const before = structuredClone(source);
  const result = buildPurchaseTelegramIdentityEvidence(source);

  assert.equal(result.evidence.length, 2);
  assert.deepEqual(source, before);
  assert.equal(result.evidence[0].telegramUserId, " 123 ");
});

test("identity evidence: calls own their arrays and mapped output records", () => {
  const source = input({
    purchases: [{ id: purchaseId, telegramUserId: "123" }],
    tokens: [token({ usedAt: null })],
  });
  const first = buildPurchaseTelegramIdentityEvidence(source);
  const second = buildPurchaseTelegramIdentityEvidence(source);

  assert.notStrictEqual(first.evidence, second.evidence);
  assert.notStrictEqual(first.evidence[0], second.evidence[0]);
  assert.notStrictEqual(first.tokenIssues, second.tokenIssues);
  assert.notStrictEqual(first.tokenIssues[0], second.tokenIssues[0]);
  first.evidence.pop();
  first.tokenIssues[0].code = "token_use_status_conflict";

  assert.equal(source.purchases.length, 1);
  assert.deepEqual(second.tokenIssues, [
    { purchaseId, tokenRecordId: "token-a", code: "token_use_timestamp_missing" },
  ]);
  assert.deepEqual(buildPurchaseTelegramIdentityEvidence(source), second);
});
