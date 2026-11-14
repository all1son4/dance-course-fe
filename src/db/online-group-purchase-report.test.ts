import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOnlineGroupPurchaseReport,
  type OnlineGroupPurchaseReportInput,
} from "./online-group-purchase-report";

type PurchaseRow = OnlineGroupPurchaseReportInput["purchases"][number];
type EntitlementRow = OnlineGroupPurchaseReportInput["entitlements"][number];
type BindingRow = OnlineGroupPurchaseReportInput["bindings"][number];
type TokenRow = OnlineGroupPurchaseReportInput["tokens"][number];

const purchaseId = "purchase-a";
const firstSeenAt = new Date("2026-09-01T10:00:00Z");

function input(
  overrides: Partial<OnlineGroupPurchaseReportInput> = {},
): OnlineGroupPurchaseReportInput {
  return { purchases: [], entitlements: [], bindings: [], tokens: [], ...overrides };
}

function purchase(overrides: Partial<PurchaseRow> = {}): PurchaseRow {
  return {
    id: purchaseId,
    productExternalId: "online-group",
    offerExternalId: "online-group-plus",
    outcome: "succeeded",
    source: "stripe",
    livemode: false,
    firstSeenAt,
    inviteHistoryCreatedAt: null,
    succeededAt: new Date("2026-09-01T10:01:00Z"),
    onlineGroupCohortId: null,
    telegramUserId: "123",
    inspirationChatIdSnapshot: "hub-a",
    inspirationAccessExpiresAtSnapshot: new Date("2026-11-01T10:00:00Z"),
    ...overrides,
  };
}

function entitlement(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    id: "right-a",
    purchaseId,
    accessKey: "primary",
    deliveryChannel: "telegram",
    accessWorkflow: "telegram-online-group",
    status: "revoked",
    startsAt: new Date("2026-09-01T10:05:00Z"),
    expiresAt: new Date("2026-10-31T23:00:00Z"),
    periodStartMode: null,
    paidDurationDays: null,
    startsAfterEntitlementId: null,
    revokedAt: new Date("2026-11-01T03:00:00Z"),
    revokedReason: "expired",
    externalTargetType: "telegram_chat",
    telegramChatId: "main-a",
    telegramUserId: "123",
    sourceKind: null,
    ...overrides,
  };
}

function binding(overrides: Partial<BindingRow> = {}): BindingRow {
  return {
    id: "binding-a",
    purchaseId,
    entitlementId: null,
    telegramUserId: "123",
    chatId: "main-a",
    boundAt: new Date("2026-09-01T10:05:00Z"),
    lastSeenAt: new Date("2026-10-01T10:00:00Z"),
    accessExpiresAt: null,
    revokedAt: null,
    revokedReason: null,
    status: "left",
    ...overrides,
  };
}

function token(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: "token-a",
    purchaseId,
    entitlementId: null,
    linkKind: "channel_invite",
    chatId: "hub-a",
    status: "used",
    expiresAt: new Date("2026-09-30T10:00:00Z"),
    usedAt: new Date("2026-09-01T10:06:00Z"),
    telegramUserId: "123",
    accessExpiresAt: null,
    createdAt: new Date("2026-09-01T10:01:00Z"),
    ...overrides,
  };
}

test("purchase report: empty input returns an empty report without invented readiness flags", () => {
  assert.deepEqual(buildOnlineGroupPurchaseReport(input()), {
    purchases: [],
    recordsWithoutPurchase: {
      entitlements: [],
      bindings: [],
      tokens: [],
      tokenIssues: [],
    },
  });
});

test("purchase report: each purchase keeps raw related facts, its identity summary and token issues", () => {
  const originalPurchase = purchase({
    onlineGroupCohortId: "cohort-a",
    inviteHistoryCreatedAt: new Date("2026-08-31T10:00:00Z"),
  });
  const right = entitlement();
  const knownBinding = binding({ telegramUserId: "999" });
  const usedToken = token();
  const issuedToken = token({
    id: "token-b",
    status: "issued",
    usedAt: null,
    telegramUserId: "777",
  });
  const brokenToken = token({ id: "token-c", usedAt: null, telegramUserId: "888" });
  const report = buildOnlineGroupPurchaseReport(
    input({
      purchases: [originalPurchase],
      entitlements: [right],
      bindings: [knownBinding],
      tokens: [brokenToken, issuedToken, usedToken],
    }),
  );

  assert.deepEqual(report, {
    purchases: [
      {
        purchase: originalPurchase,
        entitlements: [right],
        bindings: [knownBinding],
        tokens: [usedToken, issuedToken, brokenToken],
        identity: {
          purchaseId,
          status: "conflict",
          telegramUserId: null,
          candidateUserIds: ["123", "999"],
          evidence: [
            {
              purchaseId,
              source: "binding",
              sourceRecordId: knownBinding.id,
              telegramUserId: "999",
            },
            {
              purchaseId,
              source: "entitlement",
              sourceRecordId: right.id,
              telegramUserId: "123",
            },
            {
              purchaseId,
              source: "purchase",
              sourceRecordId: purchaseId,
              telegramUserId: "123",
            },
            {
              purchaseId,
              source: "used_token",
              sourceRecordId: usedToken.id,
              telegramUserId: "123",
            },
          ],
        },
        tokenIssues: [
          {
            purchaseId,
            tokenRecordId: brokenToken.id,
            code: "token_use_timestamp_missing",
          },
        ],
      },
    ],
    recordsWithoutPurchase: {
      entitlements: [],
      bindings: [],
      tokens: [],
      tokenIssues: [],
    },
  });
});

test("purchase report: a purchase without related records remains visible with a missing identity", () => {
  const original = purchase({ telegramUserId: null });
  const [entry] = buildOnlineGroupPurchaseReport(
    input({ purchases: [original] }),
  ).purchases;

  assert.deepEqual(entry, {
    purchase: original,
    entitlements: [],
    bindings: [],
    tokens: [],
    identity: {
      purchaseId,
      status: "missing",
      telegramUserId: null,
      candidateUserIds: [],
      evidence: [
        {
          purchaseId,
          source: "purchase",
          sourceRecordId: purchaseId,
          telegramUserId: null,
        },
      ],
    },
    tokenIssues: [],
  });
});

test("purchase report: other products and failed purchases are not filtered from the inventory", () => {
  const original = purchase({
    productExternalId: "another-product",
    offerExternalId: null,
    outcome: "failed",
    succeededAt: null,
  });
  const report = buildOnlineGroupPurchaseReport(input({ purchases: [original] }));

  assert.equal(report.purchases.length, 1);
  assert.deepEqual(report.purchases[0].purchase, original);
});

test("purchase report: an admin-issued purchase preserves the absence of a payment timestamp", () => {
  const original = purchase({
    source: "admin_offer_link",
    succeededAt: null,
    telegramUserId: null,
  });
  const [entry] = buildOnlineGroupPurchaseReport(
    input({ purchases: [original] }),
  ).purchases;

  assert.deepEqual(entry.purchase, original);
  assert.equal(entry.identity.status, "missing");
  assert.deepEqual(Object.keys(entry).sort(), [
    "bindings",
    "entitlements",
    "identity",
    "purchase",
    "tokenIssues",
    "tokens",
  ]);
});

test("purchase report: related records join by purchaseId rather than their own IDs", () => {
  const first = purchase();
  const second = purchase({ id: "purchase-b", telegramUserId: "999" });
  const right = entitlement({ id: second.id, purchaseId: first.id });
  const knownBinding = binding({
    id: first.id,
    purchaseId: second.id,
    telegramUserId: "999",
  });
  const report = buildOnlineGroupPurchaseReport(
    input({
      purchases: [second, first],
      entitlements: [right],
      bindings: [knownBinding],
    }),
  );

  assert.deepEqual(report.purchases[0].entitlements, [right]);
  assert.deepEqual(report.purchases[0].bindings, []);
  assert.deepEqual(report.purchases[1].entitlements, []);
  assert.deepEqual(report.purchases[1].bindings, [knownBinding]);
  assert.deepEqual(
    report.purchases.map((entry) => entry.identity.candidateUserIds),
    [["123"], ["999"]],
  );
});

test("purchase report: near-matching purchase IDs remain orphan references", () => {
  const rows = [
    entitlement({ id: "right-a", purchaseId: ` ${purchaseId} ` }),
    entitlement({ id: "right-b", purchaseId: `${purchaseId}-suffix` }),
  ];
  const report = buildOnlineGroupPurchaseReport(
    input({ purchases: [purchase()], entitlements: rows }),
  );

  assert.deepEqual(report.purchases[0].entitlements, []);
  assert.deepEqual(report.recordsWithoutPurchase.entitlements, rows);
});

test("purchase report: orphan rights, bindings, tokens and issues remain visible without invented purchases", () => {
  const right = entitlement({ purchaseId: "unknown-c" });
  const knownBinding = binding({ purchaseId: "unknown-a" });
  const brokenToken = token({ purchaseId: "unknown-b", usedAt: null });
  assert.deepEqual(
    buildOnlineGroupPurchaseReport(
      input({ entitlements: [right], bindings: [knownBinding], tokens: [brokenToken] }),
    ),
    {
      purchases: [],
      recordsWithoutPurchase: {
        entitlements: [right],
        bindings: [knownBinding],
        tokens: [brokenToken],
        tokenIssues: [
          {
            purchaseId: "unknown-b",
            tokenRecordId: brokenToken.id,
            code: "token_use_timestamp_missing",
          },
        ],
      },
    },
  );
});

test("purchase report: token issues are partitioned between known purchases and orphan references", () => {
  const own = token({ id: "token-z", usedAt: null, telegramUserId: null });
  const orphan = token({ id: "token-a", purchaseId: "unknown", status: "issued" });
  const report = buildOnlineGroupPurchaseReport(
    input({ purchases: [purchase()], tokens: [orphan, own] }),
  );

  assert.deepEqual(report.purchases[0].tokenIssues, [
    { purchaseId, tokenRecordId: own.id, code: "token_use_timestamp_missing" },
    { purchaseId, tokenRecordId: own.id, code: "token_use_user_id_missing" },
  ]);
  assert.deepEqual(report.recordsWithoutPurchase.tokenIssues, [
    {
      purchaseId: "unknown",
      tokenRecordId: orphan.id,
      code: "token_use_status_conflict",
    },
  ]);
  assert.deepEqual(report.purchases[0].tokens, [own]);
  assert.deepEqual(report.recordsWithoutPurchase.tokens, [orphan]);
});

test("purchase report: purchases sort by firstSeenAt and then ID", () => {
  const rows = [
    purchase({ id: "purchase-b" }),
    purchase(),
    purchase({ id: "purchase-z", firstSeenAt: new Date("2026-08-01T10:00:00Z") }),
  ];
  assert.deepEqual(
    buildOnlineGroupPurchaseReport(input({ purchases: rows })).purchases.map(
      (entry) => entry.purchase.id,
    ),
    ["purchase-z", purchaseId, "purchase-b"],
  );
});

test("purchase report: related lists sort by their own record IDs", () => {
  const report = buildOnlineGroupPurchaseReport(
    input({
      purchases: [purchase()],
      entitlements: [entitlement({ id: "right-z" }), entitlement()],
      bindings: [binding({ id: "binding-z" }), binding()],
      tokens: [token({ id: "token-z" }), token()],
    }),
  );
  const [entry] = report.purchases;
  assert.deepEqual(
    entry.entitlements.map((row) => row.id),
    ["right-a", "right-z"],
  );
  assert.deepEqual(
    entry.bindings.map((row) => row.id),
    ["binding-a", "binding-z"],
  );
  assert.deepEqual(
    entry.tokens.map((row) => row.id),
    ["token-a", "token-z"],
  );
});

test("purchase report: orphan lists sort by missing purchase ID and then record ID", () => {
  const report = buildOnlineGroupPurchaseReport(
    input({
      entitlements: [
        entitlement({ id: "right-a", purchaseId: "unknown-b" }),
        entitlement({ id: "right-z", purchaseId: "unknown-a" }),
        entitlement({ id: "right-b", purchaseId: "unknown-a" }),
      ],
      bindings: [
        binding({ id: "binding-a", purchaseId: "unknown-b" }),
        binding({ id: "binding-z", purchaseId: "unknown-a" }),
        binding({ id: "binding-b", purchaseId: "unknown-a" }),
      ],
      tokens: [
        token({ id: "token-a", purchaseId: "unknown-b", usedAt: null }),
        token({ id: "token-z", purchaseId: "unknown-a", usedAt: null }),
        token({ id: "token-b", purchaseId: "unknown-a", usedAt: null }),
      ],
    }),
  );

  assert.deepEqual(
    report.recordsWithoutPurchase.entitlements.map((row) => row.id),
    ["right-b", "right-z", "right-a"],
  );
  assert.deepEqual(
    report.recordsWithoutPurchase.bindings.map((row) => row.id),
    ["binding-b", "binding-z", "binding-a"],
  );
  assert.deepEqual(
    report.recordsWithoutPurchase.tokens.map((row) => row.id),
    ["token-b", "token-z", "token-a"],
  );
  assert.deepEqual(
    report.recordsWithoutPurchase.tokenIssues.map((row) => [
      row.purchaseId,
      row.tokenRecordId,
    ]),
    [
      ["unknown-a", "token-b"],
      ["unknown-a", "token-z"],
      ["unknown-b", "token-a"],
    ],
  );
});

test("purchase report: raw padded IDs survive while the summary normalizes the candidate", () => {
  const source = input({
    purchases: [purchase({ telegramUserId: " 123 " })],
    entitlements: [entitlement()],
    bindings: [binding({ telegramUserId: " " })],
    tokens: [token({ telegramUserId: " 123 " })],
  });
  const [entry] = buildOnlineGroupPurchaseReport(source).purchases;

  assert.equal(entry.identity.status, "consistent");
  assert.equal(entry.identity.telegramUserId, "123");
  assert.deepEqual(entry.identity.candidateUserIds, ["123"]);
  assert.equal(entry.purchase.telegramUserId, " 123 ");
  assert.equal(entry.tokens[0].telegramUserId, " 123 ");
  assert.equal(entry.bindings[0].telegramUserId, " ");
});

test("purchase report: unused prebound tokens stay raw while past revoked and expired use supplies identity", () => {
  const source = input({
    purchases: [purchase({ telegramUserId: null })],
    tokens: [
      token({
        id: "token-issued",
        status: "issued",
        usedAt: null,
        telegramUserId: "999",
      }),
      token({ id: "token-revoked", status: "revoked" }),
      token({ id: "token-expired", status: "expired" }),
    ],
  });
  const [entry] = buildOnlineGroupPurchaseReport(source).purchases;

  assert.equal(entry.tokens.length, 3);
  assert.equal(entry.identity.telegramUserId, "123");
  assert.deepEqual(entry.identity.candidateUserIds, ["123"]);
  assert.deepEqual(
    entry.identity.evidence
      .filter((row) => row.source === "used_token")
      .map((row) => row.sourceRecordId),
    ["token-expired", "token-revoked"],
  );
  assert.deepEqual(entry.tokenIssues, []);
});

test("purchase report: consistent identity does not hide an ambiguous token record", () => {
  const [entry] = buildOnlineGroupPurchaseReport(
    input({
      purchases: [purchase()],
      tokens: [token({ usedAt: null, telegramUserId: "999" })],
    }),
  ).purchases;

  assert.equal(entry.identity.status, "consistent");
  assert.equal(entry.identity.telegramUserId, "123");
  assert.deepEqual(entry.tokenIssues, [
    { purchaseId, tokenRecordId: "token-a", code: "token_use_timestamp_missing" },
  ]);
  assert.equal(entry.tokens[0].telegramUserId, "999");
});

test("purchase report: frozen input, historical dates and independent results survive input permutations", () => {
  const source = Object.freeze(
    input({
      purchases: Object.freeze([
        Object.freeze(purchase({ id: "purchase-b" })),
        Object.freeze(purchase()),
      ]),
      entitlements: Object.freeze([
        Object.freeze(entitlement({ id: "right-z" })),
        Object.freeze(entitlement()),
        Object.freeze(entitlement({ id: "right-orphan", purchaseId: "unknown" })),
      ]),
      bindings: Object.freeze([Object.freeze(binding())]),
      tokens: Object.freeze([
        Object.freeze(token({ usedAt: null })),
        Object.freeze(token({ id: "token-orphan", purchaseId: "unknown", usedAt: null })),
      ]),
    }),
  );
  const before = structuredClone(source);
  const first = buildOnlineGroupPurchaseReport(source);
  const second = buildOnlineGroupPurchaseReport(source);
  const reversed = input({
    purchases: [...source.purchases].reverse(),
    entitlements: [...source.entitlements].reverse(),
    bindings: [...source.bindings].reverse(),
    tokens: [...source.tokens].reverse(),
  });

  assert.deepEqual(source, before);
  assert.deepEqual(first, buildOnlineGroupPurchaseReport(reversed));
  assert.notStrictEqual(first.purchases, second.purchases);
  assert.notStrictEqual(
    first.purchases[0].entitlements,
    second.purchases[0].entitlements,
  );
  assert.notStrictEqual(
    first.purchases[0].identity.candidateUserIds,
    second.purchases[0].identity.candidateUserIds,
  );
  assert.notStrictEqual(
    first.recordsWithoutPurchase.entitlements,
    second.recordsWithoutPurchase.entitlements,
  );
  first.purchases[0].entitlements.pop();
  first.purchases[0].identity.candidateUserIds.reverse();
  first.recordsWithoutPurchase.entitlements.pop();
  first.recordsWithoutPurchase.tokenIssues[0].code = "token_use_status_conflict";

  assert.deepEqual(source, before);
  assert.deepEqual(second, buildOnlineGroupPurchaseReport(source));
});
