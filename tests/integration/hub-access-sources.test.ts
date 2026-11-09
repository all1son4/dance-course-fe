import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDeclaredMigrationPhase } from "@/db/migration-policy";

import { withHubAccessFixture } from "../helpers/hub-access-fixture";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 1,
  prepare: false,
});

after(async () => {
  await client.end();
});

type EntitlementValues = {
  access_key?: string;
  source_kind?: string | null;
  telegram_chat_id?: string;
  starts_at?: Date;
  expires_at?: Date;
};

type EntitlementRow = {
  id: string;
  purchase_id: string;
  access_key: string;
  source_kind: string | null;
  telegram_chat_id: string | null;
  starts_at: Date | null;
  expires_at: Date | null;
};

type PurchaseProvenance = {
  online_group_cohort_id: string | null;
  telegram_user_id: string | null;
};

const insertEntitlement = (
  tx: postgres.TransactionSql,
  purchaseId: string,
  values: EntitlementValues = {},
) => tx<EntitlementRow[]>`
  INSERT INTO access_entitlements ${tx({ purchase_id: purchaseId, ...values })}
  RETURNING id, purchase_id, access_key, source_kind, telegram_chat_id,
    starts_at, expires_at
`;

const readPurchaseProvenance = async (
  tx: postgres.TransactionSql,
  purchaseId: string,
): Promise<PurchaseProvenance> => {
  const [purchase] = await tx<PurchaseProvenance[]>`
    SELECT online_group_cohort_id, telegram_user_id
    FROM purchases WHERE id = ${purchaseId}
  `;

  assert.ok(purchase);
  return purchase;
};

const hasConstraintViolation =
  (code: string, constraintName: string) =>
  (error: unknown): boolean =>
    error instanceof postgres.PostgresError &&
    error.code === code &&
    error.constraint_name === constraintName;

test("the access source migration is declared as an expand release", () => {
  const source = readFileSync("drizzle/0025_hub_access_sources.sql", "utf8");

  assert.equal(getDeclaredMigrationPhase(source), "expand");
});

test("legacy purchases and primary access can omit all provenance fields", async () => {
  await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
    const purchase = await readPurchaseProvenance(tx, purchaseId);
    const [entitlement] = await insertEntitlement(tx, purchaseId);

    assert.deepEqual(purchase, {
      online_group_cohort_id: null,
      telegram_user_id: null,
    });
    assert.equal(entitlement.purchase_id, purchaseId);
    assert.equal(entitlement.access_key, "primary");
    assert.equal(entitlement.source_kind, null);
  });
});

test("unclassified access can preserve a legacy custom key", async () => {
  await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
    const [entitlement] = await insertEntitlement(tx, purchaseId, {
      access_key: "legacy-custom-access",
      source_kind: null,
    });

    assert.equal(entitlement.access_key, "legacy-custom-access");
    assert.equal(entitlement.source_kind, null);
  });
});

test("one Plus purchase can have main group, included Hub and bridge rights with separate dates", async () => {
  await withHubAccessFixture(
    client,
    async ({ cohortId, hubChatId, mainChatId, purchaseId, tx }) => {
      await tx`
        UPDATE purchases
        SET online_group_cohort_id = ${cohortId}, telegram_user_id = '123456789'
        WHERE id = ${purchaseId}
      `;

      const startsAt = new Date("2026-10-01T08:00:00.000Z");
      const expiresAt = new Date("2026-11-15T23:00:00.000Z");
      const bridgeStartsAt = new Date("2026-09-29T22:00:00.000Z");
      const values: EntitlementValues[] = [
        {
          access_key: "primary",
          source_kind: "online_group",
          telegram_chat_id: mainChatId,
          starts_at: startsAt,
          expires_at: expiresAt,
        },
        {
          access_key: "inspiration-hub",
          source_kind: "online_group",
          telegram_chat_id: hubChatId,
          starts_at: startsAt,
          expires_at: expiresAt,
        },
        {
          access_key: "inspiration-hub-bridge",
          source_kind: "hub_bridge",
          telegram_chat_id: hubChatId,
          starts_at: bridgeStartsAt,
          expires_at: startsAt,
        },
      ];

      for (const value of values) {
        await insertEntitlement(tx, purchaseId, value);
      }

      const entitlements = await tx<EntitlementRow[]>`
        SELECT id, purchase_id, access_key, source_kind, telegram_chat_id,
          starts_at, expires_at
        FROM access_entitlements WHERE purchase_id = ${purchaseId}
        ORDER BY access_key
      `;

      assert.deepEqual(await readPurchaseProvenance(tx, purchaseId), {
        online_group_cohort_id: cohortId,
        telegram_user_id: "123456789",
      });
      assert.equal(entitlements.length, 3);

      for (const expected of values) {
        const actual = entitlements.find(
          (entitlement) => entitlement.access_key === expected.access_key,
        );
        assert.ok(actual);
        assert.equal(actual.purchase_id, purchaseId);
        assert.equal(actual.source_kind, expected.source_kind);
        assert.equal(actual.telegram_chat_id, expected.telegram_chat_id);
        assert.equal(actual.starts_at?.toISOString(), expected.starts_at?.toISOString());
        assert.equal(
          actual.expires_at?.toISOString(),
          expected.expires_at?.toISOString(),
        );
      }
    },
  );
});

test("standalone Hub access does not enroll its purchase in an Online cohort", async () => {
  await withHubAccessFixture(client, async ({ hubChatId, purchaseId, tx }) => {
    const startsAt = new Date("2026-11-01T12:00:00.000Z");
    const expiresAt = new Date("2026-12-27T12:00:00.000Z");
    const [entitlement] = await insertEntitlement(tx, purchaseId, {
      access_key: "inspiration-hub",
      source_kind: "standalone_hub",
      telegram_chat_id: hubChatId,
      starts_at: startsAt,
      expires_at: expiresAt,
    });

    assert.equal(
      (await readPurchaseProvenance(tx, purchaseId)).online_group_cohort_id,
      null,
    );
    assert.equal(entitlement.source_kind, "standalone_hub");
    assert.equal(entitlement.access_key, "inspiration-hub");
    assert.equal(entitlement.telegram_chat_id, hubChatId);
    assert.equal(entitlement.starts_at?.toISOString(), startsAt.toISOString());
    assert.equal(entitlement.expires_at?.toISOString(), expiresAt.toISOString());
  });
});

test("different purchases can belong to the same cohort", async () => {
  await withHubAccessFixture(client, async ({ cohortId, purchaseId, tx }) => {
    await tx`
      UPDATE purchases SET online_group_cohort_id = ${cohortId}
      WHERE id = ${purchaseId}
    `;
    const [second] = await tx<{ id: string; online_group_cohort_id: string }[]>`
      INSERT INTO purchases (
        payment_intent_id, amount_minor, currency, stripe_status, outcome,
        online_group_cohort_id
      )
      VALUES (${`pi_second_cohort_${randomUUID()}`}, 5000, 'eur', 'succeeded',
        'succeeded', ${cohortId})
      RETURNING id, online_group_cohort_id
    `;

    assert.notEqual(second.id, purchaseId);
    assert.equal(second.online_group_cohort_id, cohortId);
    const [result] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM purchases
      WHERE online_group_cohort_id = ${cohortId}
    `;
    assert.equal(result.count, 2);
  });
});

test("a purchase rejects an unknown cohort without changing its previous association", async () => {
  await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        UPDATE purchases SET online_group_cohort_id = ${randomUUID()}
        WHERE id = ${purchaseId}
      `,
      ),
      hasConstraintViolation("23503", "purchases_online_group_cohort_fk"),
    );

    assert.equal(
      (await readPurchaseProvenance(tx, purchaseId)).online_group_cohort_id,
      null,
    );
  });
});

test("a cohort referenced by a purchase cannot be deleted", async () => {
  await withHubAccessFixture(client, async ({ cohortId, purchaseId, tx }) => {
    await tx`
      UPDATE purchases SET online_group_cohort_id = ${cohortId}
      WHERE id = ${purchaseId}
    `;

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`
        DELETE FROM online_group_cohorts WHERE id = ${cohortId}
      `,
      ),
      hasConstraintViolation("23503", "purchases_online_group_cohort_fk"),
    );

    assert.equal(
      (await readPurchaseProvenance(tx, purchaseId)).online_group_cohort_id,
      cohortId,
    );
  });
});

for (const telegramUserId of ["", "   "]) {
  test(`a purchase rejects a blank Telegram ID ${JSON.stringify(telegramUserId)}`, async () => {
    await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
      await assert.rejects(
        tx.savepoint(
          (attempt) => attempt`
          UPDATE purchases SET telegram_user_id = ${telegramUserId}
          WHERE id = ${purchaseId}
        `,
        ),
        hasConstraintViolation("23514", "purchases_telegram_user_id_check"),
      );
    });
  });
}

for (const sourceKind of ["unknown_source", ""]) {
  test(`an unknown access source ${JSON.stringify(sourceKind)} fails its domain constraint`, async () => {
    await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
      await assert.rejects(
        tx.savepoint((attempt) =>
          insertEntitlement(attempt, purchaseId, {
            access_key: "primary",
            source_kind: sourceKind,
          }),
        ),
        hasConstraintViolation("23514", "access_entitlements_source_kind_check"),
      );
    });
  });
}

const incompatibleSources = [
  { sourceKind: "online_group", accessKey: "inspiration-hub-bridge" },
  { sourceKind: "standalone_hub", accessKey: "primary" },
  { sourceKind: "hub_bridge", accessKey: "inspiration-hub" },
];

for (const { sourceKind, accessKey } of incompatibleSources) {
  test(`${sourceKind} rejects the incompatible key ${accessKey}`, async () => {
    await withHubAccessFixture(client, async ({ purchaseId, tx }) => {
      await assert.rejects(
        tx.savepoint((attempt) =>
          insertEntitlement(attempt, purchaseId, {
            access_key: accessKey,
            source_kind: sourceKind,
          }),
        ),
        hasConstraintViolation("23514", "access_entitlements_source_key_check"),
      );
    });
  });
}

test("access sources preserve the existing unique purchase and access key rule", async () => {
  await withHubAccessFixture(client, async ({ cohortId, hubChatId, purchaseId, tx }) => {
    await tx`
      UPDATE purchases SET online_group_cohort_id = ${cohortId}
      WHERE id = ${purchaseId}
    `;
    const values = {
      access_key: "inspiration-hub",
      source_kind: "online_group",
      telegram_chat_id: hubChatId,
    };
    await insertEntitlement(tx, purchaseId, values);

    await assert.rejects(
      tx.savepoint((attempt) => insertEntitlement(attempt, purchaseId, values)),
      hasConstraintViolation("23505", "access_entitlements_purchase_key_idx"),
    );
  });
});
