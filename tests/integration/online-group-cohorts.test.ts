import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDeclaredMigrationPhase } from "@/db/migration-policy";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 1,
  prepare: false,
});

after(async () => {
  await client.end();
});

const STARTS_AT = new Date("2026-10-01T08:00:00.000Z");
const CLOSED_AT = new Date("2026-11-15T17:00:00.000Z");
const ACCESS_ENDS_AT = new Date("2026-11-15T23:00:00.000Z");
const LESSONS_CLEARED_AT = new Date("2026-11-15T16:00:00.000Z");

type CohortValues = {
  id?: string;
  title?: string;
  main_chat_id: string;
  starts_at?: Date;
  previous_cohort_id?: string | null;
  closed_at?: Date | null;
  access_ends_at?: Date | null;
  lessons_cleared_at?: Date | null;
  sales_enabled?: boolean;
};

type CohortRow = {
  id: string;
  title: string;
  main_chat_id: string;
  starts_at: Date;
  previous_cohort_id: string | null;
  closed_at: Date | null;
  access_ends_at: Date | null;
  lessons_cleared_at: Date | null;
  sales_enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type CohortFixture = {
  chatId: string;
  registerChat: () => Promise<string>;
  tx: postgres.TransactionSql;
};

// All fixture writes roll back, including when the assertion fails.
const withCohortFixture = async (
  run: (fixture: CohortFixture) => Promise<void>,
): Promise<void> => {
  const rollback = new Error("rollback_online_group_cohort_fixture");

  try {
    await client.begin(async (tx) => {
      const registerChat = async (): Promise<string> => {
        const chatId = `cohort_test_${randomUUID()}`;
        await tx`
          INSERT INTO telegram_chats (chat_id, title, type)
          VALUES (${chatId}, 'Cohort test', 'supergroup')
        `;
        return chatId;
      };

      await run({ chatId: await registerChat(), registerChat, tx });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
};

const insertCohort = (tx: postgres.TransactionSql, values: CohortValues) => {
  const row = { title: "Online Group test", starts_at: STARTS_AT, ...values };

  return tx<CohortRow[]>`
    INSERT INTO online_group_cohorts ${tx(row)}
    RETURNING *
  `;
};

const hasConstraintViolation =
  (code: string, constraintName: string) =>
  (error: unknown): boolean =>
    error instanceof postgres.PostgresError &&
    error.code === code &&
    error.constraint_name === constraintName;

test("the cohort migration is declared as an expand release", () => {
  const source = readFileSync("drizzle/0024_online_group_cohorts.sql", "utf8");

  assert.equal(getDeclaredMigrationPhase(source), "expand");
});

test("a new cohort has a stable ID, audit dates, unknown closure dates and disabled sales", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    const [cohort] = await insertCohort(tx, { main_chat_id: chatId });

    assert.match(cohort.id, /^[0-9a-f-]{36}$/u);
    assert.equal(cohort.main_chat_id, chatId);
    assert.equal(cohort.starts_at.toISOString(), STARTS_AT.toISOString());
    assert.equal(cohort.previous_cohort_id, null);
    assert.equal(cohort.closed_at, null);
    assert.equal(cohort.access_ends_at, null);
    assert.equal(cohort.lessons_cleared_at, null);
    assert.equal(cohort.sales_enabled, false);
    assert.ok(cohort.created_at instanceof Date);
    assert.ok(cohort.updated_at instanceof Date);
  });
});

test("multiple cohorts may have an unknown predecessor", async () => {
  await withCohortFixture(async ({ chatId, registerChat, tx }) => {
    const [first] = await insertCohort(tx, { main_chat_id: chatId });
    const [second] = await insertCohort(tx, {
      main_chat_id: await registerChat(),
    });

    assert.notEqual(first.id, second.id);
    assert.equal(first.previous_cohort_id, null);
    assert.equal(second.previous_cohort_id, null);
  });
});

test("renaming a cohort preserves its ID and the next cohort's predecessor", async () => {
  await withCohortFixture(async ({ chatId, registerChat, tx }) => {
    const [first] = await insertCohort(tx, { main_chat_id: chatId });
    const [second] = await insertCohort(tx, {
      main_chat_id: await registerChat(),
      previous_cohort_id: first.id,
    });
    const [third] = await insertCohort(tx, {
      main_chat_id: await registerChat(),
      previous_cohort_id: second.id,
    });

    const [updated] = await tx<{ id: string; title: string }[]>`
      UPDATE online_group_cohorts SET title = 'Renamed cohort'
      WHERE id = ${second.id}
      RETURNING id, title
    `;
    const [successor] = await tx<{ previous_cohort_id: string }[]>`
      SELECT previous_cohort_id FROM online_group_cohorts
      WHERE id = ${third.id}
    `;

    assert.equal(updated.id, second.id);
    assert.equal(updated.title, "Renamed cohort");
    assert.equal(successor.previous_cohort_id, second.id);
  });
});

test("a cohort rejects an unregistered main chat", async () => {
  await withCohortFixture(async ({ tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertCohort(attempt, { main_chat_id: `missing_${randomUUID()}` }),
      ),
      hasConstraintViolation("23503", "online_group_cohorts_main_chat_fk"),
    );
  });
});

test("a referenced cohort chat cannot be deleted", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    await insertCohort(tx, { main_chat_id: chatId });

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`DELETE FROM telegram_chats WHERE chat_id = ${chatId}`,
      ),
      hasConstraintViolation("23503", "online_group_cohorts_main_chat_fk"),
    );
  });
});

test("a main chat cannot be reused for another cohort", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    await insertCohort(tx, { main_chat_id: chatId });

    await assert.rejects(
      tx.savepoint((attempt) => insertCohort(attempt, { main_chat_id: chatId })),
      hasConstraintViolation("23505", "online_group_cohorts_main_chat_idx"),
    );
  });
});

test("a cohort rejects an unknown predecessor", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    await assert.rejects(
      tx.savepoint((attempt) =>
        insertCohort(attempt, {
          main_chat_id: chatId,
          previous_cohort_id: randomUUID(),
        }),
      ),
      hasConstraintViolation("23503", "online_group_cohorts_previous_fk"),
    );
  });
});

test("a cohort cannot be its own predecessor", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    const id = randomUUID();

    await assert.rejects(
      tx.savepoint((attempt) =>
        insertCohort(attempt, {
          id,
          main_chat_id: chatId,
          previous_cohort_id: id,
        }),
      ),
      hasConstraintViolation("23514", "online_group_cohorts_previous_not_self_check"),
    );
  });
});

test("a predecessor cannot have two successor cohorts", async () => {
  await withCohortFixture(async ({ chatId, registerChat, tx }) => {
    const [first] = await insertCohort(tx, { main_chat_id: chatId });
    await insertCohort(tx, {
      main_chat_id: await registerChat(),
      previous_cohort_id: first.id,
    });
    const anotherChatId = await registerChat();

    await assert.rejects(
      tx.savepoint((attempt) =>
        insertCohort(attempt, {
          main_chat_id: anotherChatId,
          previous_cohort_id: first.id,
        }),
      ),
      hasConstraintViolation("23505", "online_group_cohorts_previous_cohort_idx"),
    );
  });
});

test("a predecessor cannot be deleted while a successor references it", async () => {
  await withCohortFixture(async ({ chatId, registerChat, tx }) => {
    const [first] = await insertCohort(tx, { main_chat_id: chatId });
    await insertCohort(tx, {
      main_chat_id: await registerChat(),
      previous_cohort_id: first.id,
    });

    await assert.rejects(
      tx.savepoint(
        (attempt) => attempt`DELETE FROM online_group_cohorts WHERE id = ${first.id}`,
      ),
      hasConstraintViolation("23503", "online_group_cohorts_previous_fk"),
    );
  });
});

for (const title of ["", "   "]) {
  test(`a cohort rejects an empty or blank title ${JSON.stringify(title)}`, async () => {
    await withCohortFixture(async ({ chatId, tx }) => {
      await assert.rejects(
        tx.savepoint((attempt) => insertCohort(attempt, { main_chat_id: chatId, title })),
        hasConstraintViolation("23514", "online_group_cohorts_title_check"),
      );
    });
  });
}

test("an unclosed cohort can enable sales", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    const [cohort] = await insertCohort(tx, {
      main_chat_id: chatId,
      sales_enabled: true,
    });

    assert.equal(cohort.closed_at, null);
    assert.equal(cohort.sales_enabled, true);
  });
});

test("lesson preparation can be confirmed before closure", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    const [cohort] = await insertCohort(tx, {
      main_chat_id: chatId,
      lessons_cleared_at: LESSONS_CLEARED_AT,
    });

    assert.equal(cohort.closed_at, null);
    assert.equal(cohort.access_ends_at, null);
    assert.equal(
      cohort.lessons_cleared_at?.toISOString(),
      LESSONS_CLEARED_AT.toISOString(),
    );
  });
});

test("a cohort can close with confirmed lessons and a later access boundary", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    await insertCohort(tx, { main_chat_id: chatId, sales_enabled: true });

    const [cohort] = await tx<CohortRow[]>`
      UPDATE online_group_cohorts
      SET closed_at = ${CLOSED_AT}, access_ends_at = ${ACCESS_ENDS_AT},
          lessons_cleared_at = ${LESSONS_CLEARED_AT}, sales_enabled = false
      WHERE main_chat_id = ${chatId}
      RETURNING *
    `;

    assert.equal(cohort.closed_at?.toISOString(), CLOSED_AT.toISOString());
    assert.equal(cohort.access_ends_at?.toISOString(), ACCESS_ENDS_AT.toISOString());
    assert.equal(cohort.sales_enabled, false);
  });
});

test("closure and lesson confirmation can occur exactly at the cohort start", async () => {
  await withCohortFixture(async ({ chatId, tx }) => {
    const [cohort] = await insertCohort(tx, {
      main_chat_id: chatId,
      closed_at: STARTS_AT,
      access_ends_at: new Date("2026-10-01T22:00:00.000Z"),
      lessons_cleared_at: STARTS_AT,
    });

    assert.equal(cohort.closed_at?.toISOString(), STARTS_AT.toISOString());
    assert.equal(cohort.lessons_cleared_at?.toISOString(), STARTS_AT.toISOString());
  });
});

const invalidClosures: {
  name: string;
  values: Omit<CohortValues, "main_chat_id">;
  constraint: string;
}[] = [
  {
    name: "a closure requires an access end",
    values: {
      closed_at: CLOSED_AT,
      lessons_cleared_at: LESSONS_CLEARED_AT,
    },
    constraint: "online_group_cohorts_closure_pair_check",
  },
  {
    name: "an access end requires a closure",
    values: { access_ends_at: ACCESS_ENDS_AT },
    constraint: "online_group_cohorts_closure_pair_check",
  },
  {
    name: "a cohort cannot close before it starts",
    values: {
      closed_at: new Date("2026-09-30T17:00:00.000Z"),
      access_ends_at: new Date("2026-09-30T22:00:00.000Z"),
      lessons_cleared_at: new Date("2026-09-30T16:00:00.000Z"),
    },
    constraint: "online_group_cohorts_closure_time_check",
  },
  {
    name: "access cannot end before closure",
    values: {
      closed_at: CLOSED_AT,
      access_ends_at: LESSONS_CLEARED_AT,
      lessons_cleared_at: LESSONS_CLEARED_AT,
    },
    constraint: "online_group_cohorts_closure_time_check",
  },
  {
    name: "a closed cohort requires lesson preparation confirmation",
    values: {
      closed_at: CLOSED_AT,
      access_ends_at: ACCESS_ENDS_AT,
    },
    constraint: "online_group_cohorts_lessons_cleared_check",
  },
  {
    name: "lesson preparation confirmation cannot be later than closure",
    values: {
      closed_at: CLOSED_AT,
      access_ends_at: ACCESS_ENDS_AT,
      lessons_cleared_at: new Date("2026-11-15T18:00:00.000Z"),
    },
    constraint: "online_group_cohorts_lessons_cleared_check",
  },
  {
    name: "a closed cohort cannot keep sales enabled",
    values: {
      closed_at: CLOSED_AT,
      access_ends_at: ACCESS_ENDS_AT,
      lessons_cleared_at: LESSONS_CLEARED_AT,
      sales_enabled: true,
    },
    constraint: "online_group_cohorts_sales_open_check",
  },
  {
    name: "access cannot end at the exact moment of closure",
    values: {
      closed_at: CLOSED_AT,
      access_ends_at: CLOSED_AT,
      lessons_cleared_at: LESSONS_CLEARED_AT,
    },
    constraint: "online_group_cohorts_closure_time_check",
  },
];

for (const { name, values, constraint } of invalidClosures) {
  test(name, async () => {
    await withCohortFixture(async ({ chatId, tx }) => {
      await assert.rejects(
        tx.savepoint((attempt) =>
          insertCohort(attempt, { main_chat_id: chatId, ...values }),
        ),
        hasConstraintViolation("23514", constraint),
      );
    });
  });
}
