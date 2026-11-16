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

const STARTS_AT = new Date("2026-11-15T23:00:00.000Z");
const EXPIRES_AT = new Date("2027-01-10T23:00:00.000Z");
const SECOND_EXPIRES_AT = new Date("2027-03-07T23:00:00.000Z");

type PeriodValues = {
  id?: string;
  access_key?: string;
  source_kind?: string | null;
  period_start_mode?: string | null;
  paid_duration_days?: number | null;
  starts_after_entitlement_id?: string | null;
  starts_at?: Date | null;
  expires_at?: Date | null;
};

type PeriodRow = {
  id: string;
  purchase_id: string;
  source_kind: string | null;
  period_start_mode: string | null;
  paid_duration_days: number | null;
  starts_after_entitlement_id: string | null;
  starts_at: Date | null;
  expires_at: Date | null;
};

type PeriodFixture = {
  parentId: string;
  parentPurchaseId: string;
  purchaseId: string;
  tx: postgres.TransactionSql;
};

const PAYMENT_PERIOD: PeriodValues = {
  period_start_mode: "payment",
  paid_duration_days: 56,
  starts_at: STARTS_AT,
  expires_at: EXPIRES_AT,
};

const insertPeriod = (
  tx: postgres.TransactionSql,
  purchaseId: string,
  values: PeriodValues = {},
) => tx<PeriodRow[]>`
  INSERT INTO access_entitlements ${tx({
    purchase_id: purchaseId,
    access_key: "inspiration-hub",
    source_kind: "standalone_hub",
    ...values,
  })}
  RETURNING id, purchase_id, source_kind, period_start_mode, paid_duration_days,
    starts_after_entitlement_id, starts_at, expires_at
`;

const insertHubPurchase = async (tx: postgres.TransactionSql): Promise<string> => {
  const [purchase] = await tx<{ id: string }[]>`
    INSERT INTO purchases (
      payment_intent_id, amount_minor, currency, stripe_status, outcome,
      telegram_user_id
    )
    VALUES (${`pi_paid_period_${randomUUID()}`}, 4000, 'eur', 'succeeded',
      'succeeded', '123456789')
    RETURNING id
  `;

  assert.ok(purchase);
  return purchase.id;
};

const withPeriodFixture = (
  run: (fixture: PeriodFixture) => Promise<void>,
): Promise<void> =>
  withHubAccessFixture(client, async ({ cohortId, purchaseId, tx }) => {
    await tx`
      UPDATE purchases
      SET online_group_cohort_id = ${cohortId}, telegram_user_id = '123456789'
      WHERE id = ${purchaseId}
    `;
    const [parent] = await insertPeriod(tx, purchaseId, {
      access_key: "primary",
      source_kind: "online_group",
    });

    await run({
      parentId: parent.id,
      parentPurchaseId: purchaseId,
      purchaseId: await insertHubPurchase(tx),
      tx,
    });
  });

const hasConstraintViolation =
  (code: string, constraintName: string) =>
  (error: unknown): boolean =>
    error instanceof postgres.PostgresError &&
    error.code === code &&
    error.constraint_name === constraintName;

const pendingValues = (parentId: string): PeriodValues => ({
  period_start_mode: "after_entitlement",
  paid_duration_days: 56,
  starts_after_entitlement_id: parentId,
});

test("the paid period migration is declared as an expand release", () => {
  const source = readFileSync("drizzle/0026_hub_paid_periods.sql", "utf8");

  assert.equal(getDeclaredMigrationPhase(source), "expand");
});

test("legacy classified Hub access can retain an expiry without a known start", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    const [period] = await insertPeriod(tx, purchaseId, {
      expires_at: EXPIRES_AT,
    });

    assert.equal(period.source_kind, "standalone_hub");
    assert.equal(period.period_start_mode, null);
    assert.equal(period.paid_duration_days, null);
    assert.equal(period.starts_after_entitlement_id, null);
    assert.equal(period.starts_at, null);
    assert.equal(period.expires_at?.toISOString(), EXPIRES_AT.toISOString());
  });
});

test("a payment-started Hub period stores 56 days and two known dates", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    const [period] = await insertPeriod(tx, purchaseId, PAYMENT_PERIOD);

    assert.equal(period.period_start_mode, "payment");
    assert.equal(period.paid_duration_days, 56);
    assert.equal(period.starts_after_entitlement_id, null);
    assert.equal(period.starts_at?.toISOString(), STARTS_AT.toISOString());
    assert.equal(period.expires_at?.toISOString(), EXPIRES_AT.toISOString());
  });
});

test("independent payment-started periods can both have no predecessor", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    const [first] = await insertPeriod(tx, purchaseId, PAYMENT_PERIOD);
    const [second] = await insertPeriod(tx, await insertHubPurchase(tx), PAYMENT_PERIOD);

    assert.notEqual(first.id, second.id);
    assert.equal(first.starts_after_entitlement_id, null);
    assert.equal(second.starts_after_entitlement_id, null);
  });
});

test("a paid continuation can wait for the Online right without invented dates", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    const [period] = await insertPeriod(tx, purchaseId, pendingValues(parentId));

    assert.equal(period.period_start_mode, "after_entitlement");
    assert.equal(period.paid_duration_days, 56);
    assert.equal(period.starts_after_entitlement_id, parentId);
    assert.equal(period.starts_at, null);
    assert.equal(period.expires_at, null);
  });
});

test("two pending purchases form a chain and can receive dates without losing their provenance", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    const [first] = await insertPeriod(tx, purchaseId, pendingValues(parentId));
    const [second] = await insertPeriod(
      tx,
      await insertHubPurchase(tx),
      pendingValues(first.id),
    );

    await tx`UPDATE access_entitlements SET expires_at = ${STARTS_AT} WHERE id = ${parentId}`;
    await tx`
      UPDATE access_entitlements
      SET starts_at = ${STARTS_AT}, expires_at = ${EXPIRES_AT}
      WHERE id = ${first.id}
    `;
    await tx`
      UPDATE access_entitlements
      SET starts_at = ${EXPIRES_AT}, expires_at = ${SECOND_EXPIRES_AT}
      WHERE id = ${second.id}
    `;

    const periods = await tx<PeriodRow[]>`
      SELECT id, purchase_id, source_kind, period_start_mode, paid_duration_days,
        starts_after_entitlement_id, starts_at, expires_at
      FROM access_entitlements WHERE id IN (${first.id}, ${second.id})
      ORDER BY starts_at
    `;

    assert.deepEqual(
      periods.map((period) => ({
        id: period.id,
        predecessor: period.starts_after_entitlement_id,
        mode: period.period_start_mode,
        days: period.paid_duration_days,
        startsAt: period.starts_at?.toISOString(),
        expiresAt: period.expires_at?.toISOString(),
      })),
      [
        {
          id: first.id,
          predecessor: parentId,
          mode: "after_entitlement",
          days: 56,
          startsAt: STARTS_AT.toISOString(),
          expiresAt: EXPIRES_AT.toISOString(),
        },
        {
          id: second.id,
          predecessor: first.id,
          mode: "after_entitlement",
          days: 56,
          startsAt: EXPIRES_AT.toISOString(),
          expiresAt: SECOND_EXPIRES_AT.toISOString(),
        },
      ],
    );
  });
});

test("an unknown start mode fails its own domain constraint", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, {
          ...PAYMENT_PERIOD,
          period_start_mode: "unknown_mode",
        }),
      ),
      hasConstraintViolation("23514", "access_entitlements_period_start_mode_check"),
    );
  });
});

const invalidMetadata: { name: string; values: PeriodValues }[] = [
  { name: "legacy mode cannot retain paid days", values: { period_start_mode: null } },
  {
    name: "a new period requires explicit paid days",
    values: { paid_duration_days: null },
  },
  {
    name: "55 paid days are not an eight-week purchase",
    values: { paid_duration_days: 55 },
  },
  {
    name: "57 paid days are not an eight-week purchase",
    values: { paid_duration_days: 57 },
  },
  { name: "a new period requires an explicit source", values: { source_kind: null } },
  {
    name: "Online rights cannot carry standalone paid-period metadata",
    values: { source_kind: "online_group" },
  },
  {
    name: "a bridge cannot carry standalone paid-period metadata",
    values: { source_kind: "hub_bridge", access_key: "inspiration-hub-bridge" },
  },
];

for (const { name, values } of invalidMetadata) {
  test(name, async () => {
    await withPeriodFixture(async ({ purchaseId, tx }) => {
      await assert.rejects(
        tx.savepoint((attempt) =>
          insertPeriod(attempt, purchaseId, { ...PAYMENT_PERIOD, ...values }),
        ),
        hasConstraintViolation("23514", "access_entitlements_paid_period_metadata_check"),
      );
    });
  });
}

test("legacy mode cannot retain a period dependency", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, { starts_after_entitlement_id: parentId }),
      ),
      hasConstraintViolation("23514", "access_entitlements_paid_period_metadata_check"),
    );
  });
});

test("payment mode cannot depend on another entitlement", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, {
          ...PAYMENT_PERIOD,
          starts_after_entitlement_id: parentId,
        }),
      ),
      hasConstraintViolation("23514", "access_entitlements_period_dependency_check"),
    );
  });
});

test("after_entitlement mode requires a predecessor", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, {
          period_start_mode: "after_entitlement",
          paid_duration_days: 56,
        }),
      ),
      hasConstraintViolation("23514", "access_entitlements_period_dependency_check"),
    );
  });
});

const invalidDates = [
  { name: "only a start", startsAt: STARTS_AT, expiresAt: null },
  { name: "only an end", startsAt: null, expiresAt: EXPIRES_AT },
  { name: "equal boundaries", startsAt: STARTS_AT, expiresAt: STARTS_AT },
  { name: "an end before its start", startsAt: EXPIRES_AT, expiresAt: STARTS_AT },
];

for (const mode of ["payment", "after_entitlement"] as const) {
  const cases =
    mode === "payment"
      ? [...invalidDates, { name: "unknown dates", startsAt: null, expiresAt: null }]
      : invalidDates;

  for (const { name, startsAt, expiresAt } of cases) {
    test(`${mode} rejects ${name}`, async () => {
      await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
        await assert.rejects(
          tx.savepoint((attempt) =>
            insertPeriod(attempt, purchaseId, {
              period_start_mode: mode,
              paid_duration_days: 56,
              starts_after_entitlement_id: mode === "after_entitlement" ? parentId : null,
              starts_at: startsAt,
              expires_at: expiresAt,
            }),
          ),
          hasConstraintViolation("23514", "access_entitlements_period_dates_check"),
        );
      });
    });
  }
}

test("a period cannot depend on itself", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    const id = randomUUID();

    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, { ...pendingValues(id), id }),
      ),
      hasConstraintViolation("23514", "access_entitlements_period_not_self_check"),
    );
  });
});

test("a period rejects an unknown predecessor", async () => {
  await withPeriodFixture(async ({ purchaseId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, purchaseId, pendingValues(randomUUID())),
      ),
      hasConstraintViolation("23503", "access_entitlements_starts_after_fk"),
    );
  });
});

test("a predecessor with a paid continuation cannot be deleted", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    await insertPeriod(tx, purchaseId, pendingValues(parentId));

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`DELETE FROM access_entitlements WHERE id = ${parentId}`,
      ),
      hasConstraintViolation("23503", "access_entitlements_starts_after_fk"),
    );
  });
});

test("deleting the preceding purchase cannot cascade away a paid continuation's anchor", async () => {
  await withPeriodFixture(async ({ parentId, parentPurchaseId, purchaseId, tx }) => {
    await insertPeriod(tx, purchaseId, pendingValues(parentId));

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`DELETE FROM purchases WHERE id = ${parentPurchaseId}`,
      ),
      hasConstraintViolation("23503", "access_entitlements_starts_after_fk"),
    );
  });
});

test("two purchases cannot start after the same entitlement", async () => {
  await withPeriodFixture(async ({ parentId, purchaseId, tx }) => {
    await insertPeriod(tx, purchaseId, pendingValues(parentId));
    const secondPurchaseId = await insertHubPurchase(tx);

    await assert.rejects(
      tx.savepoint((attempt) =>
        insertPeriod(attempt, secondPurchaseId, pendingValues(parentId)),
      ),
      hasConstraintViolation("23505", "access_entitlements_starts_after_idx"),
    );
  });
});
