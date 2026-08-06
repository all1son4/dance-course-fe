import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), {
  max: 4,
  prepare: false,
});

after(async () => {
  await client.end();
});

test("rolls back a failed event transaction", async () => {
  const eventId = `evt_test_safe02_rollback_${randomUUID()}`;

  await assert.rejects(
    client.begin(async (transaction) => {
      await transaction`
        INSERT INTO stripe_events (
          stripe_event_id,
          event_type,
          processing_status,
          payload
        ) VALUES (
          ${eventId},
          'payment_intent.succeeded',
          'pending',
          '{}'::jsonb
        )
      `;

      throw new Error("force_test_rollback");
    }),
    /force_test_rollback/u,
  );

  const [row] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM stripe_events
    WHERE stripe_event_id = ${eventId}
  `;

  assert.equal(row?.count, 0);
});

test("stores one provider event under concurrent duplicate inserts", async () => {
  const eventId = `evt_test_safe02_unique_${randomUUID()}`;
  const insertEvent = () => client`
    INSERT INTO stripe_events (
      stripe_event_id,
      event_type,
      processing_status,
      payload
    ) VALUES (
      ${eventId},
      'payment_intent.succeeded',
      'pending',
      '{}'::jsonb
    )
  `;

  try {
    const results = await Promise.allSettled([insertEvent(), insertEvent()]);
    const fulfilledCount = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    const rejectedResults = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    assert.equal(fulfilledCount, 1);
    assert.equal(rejectedResults.length, 1);
    assert.equal(rejectedResults[0]?.reason?.code, "23505");

    const [row] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;

    assert.equal(row?.count, 1);
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id = ${eventId}
    `;
  }
});
