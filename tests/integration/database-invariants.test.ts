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

const assertConstraintViolation = async (
  operation: Promise<unknown>,
  constraintName: string,
) => {
  await assert.rejects(operation, (error: unknown) => {
    if (!error || typeof error !== "object") {
      return false;
    }

    return (
      "code" in error &&
      error.code === "23514" &&
      "constraint_name" in error &&
      error.constraint_name === constraintName
    );
  });
};

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

test("rejects invalid catalog, purchase, and report values", async () => {
  const suffix = randomUUID();

  await assertConstraintViolation(
    client`
      INSERT INTO products (
        code,
        external_product_id,
        slug,
        type,
        title,
        description,
        description_keys
      ) VALUES (
        ${`invalid-${suffix}`},
        ${`invalid-${suffix}`},
        ${`invalid-${suffix}`},
        'video',
        'Invalid product',
        '[]'::jsonb,
        '[]'::jsonb
      )
    `,
    "products_type_check",
  );

  await assertConstraintViolation(
    client`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome
      ) VALUES (
        ${`pi_invalid_amount_${suffix}`},
        -1,
        'pln',
        'requires_payment_method',
        'failed'
      )
    `,
    "purchases_amount_minor_check",
  );

  await assertConstraintViolation(
    client`
      INSERT INTO monthly_report_runs (
        report_key,
        report_family,
        period_start_utc,
        period_end_utc,
        generated_at_utc,
        delivery_status,
        row_count
      ) VALUES (
        ${`invalid-report-${suffix}`},
        'monthly-sales',
        '2026-08-02T00:00:00Z',
        '2026-08-01T00:00:00Z',
        '2026-08-03T00:00:00Z',
        'sent',
        0
      )
    `,
    "monthly_report_runs_status_range_check",
  );
});

test("keeps offer ownership coherent across products", async () => {
  const suffix = randomUUID();
  const [firstProduct] = await client<{ id: string }[]>`
    INSERT INTO products (
      code,
      external_product_id,
      slug,
      type,
      title,
      description,
      description_keys
    ) VALUES (
      ${`first-${suffix}`},
      ${`first-${suffix}`},
      ${`first-${suffix}`},
      'course',
      'First product',
      '[]'::jsonb,
      '[]'::jsonb
    )
    RETURNING id
  `;
  const [secondProduct] = await client<{ id: string }[]>`
    INSERT INTO products (
      code,
      external_product_id,
      slug,
      type,
      title,
      description,
      description_keys
    ) VALUES (
      ${`second-${suffix}`},
      ${`second-${suffix}`},
      ${`second-${suffix}`},
      'course',
      'Second product',
      '[]'::jsonb,
      '[]'::jsonb
    )
    RETURNING id
  `;

  try {
    const [offer] = await client<{ id: string }[]>`
      INSERT INTO product_offers (
        external_offer_id,
        product_id,
        code,
        label
      ) VALUES (
        ${`offer-${suffix}`},
        ${firstProduct.id},
        'standard',
        'Standard'
      )
      RETURNING id
    `;

    await assert.rejects(
      client`
        INSERT INTO purchases (
          payment_intent_id,
          product_id,
          offer_id,
          amount_minor,
          currency,
          stripe_status,
          outcome
        ) VALUES (
          ${`pi_mismatched_offer_${suffix}`},
          ${secondProduct.id},
          ${offer.id},
          100,
          'pln',
          'requires_payment_method',
          'failed'
        )
      `,
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23503" &&
          "constraint_name" in error &&
          error.constraint_name === "purchases_offer_product_fk",
        ),
    );
  } finally {
    await client`
      DELETE FROM products
      WHERE id IN (${firstProduct.id}, ${secondProduct.id})
    `;
  }
});

test("keeps one validated checkpoint per backfill source", async () => {
  const sourceFingerprint = randomUUID().replaceAll("-", "").padEnd(64, "0");
  const [run] = await client<{ id: string }[]>`
    INSERT INTO data_backfill_runs (
      backfill_key,
      target_environment,
      source_capture_id,
      source_fingerprint,
      source_cut_off_at,
      source_row_counts,
      batch_size,
      stage,
      stats
    ) VALUES (
      'google-sheets-v1',
      'development',
      'development-test-capture',
      ${sourceFingerprint},
      '2026-08-11T11:25:02Z',
      '{"payments":2}'::jsonb,
      25,
      'payments',
      '{}'::jsonb
    )
    RETURNING id
  `;

  try {
    await assert.rejects(
      client`
        INSERT INTO data_backfill_runs (
          backfill_key,
          target_environment,
          source_capture_id,
          source_fingerprint,
          source_cut_off_at,
          source_row_counts,
          batch_size,
          stage,
          stats
        ) VALUES (
          'google-sheets-v1',
          'development',
          'development-test-capture-duplicate',
          ${sourceFingerprint},
          '2026-08-11T11:25:02Z',
          '{}'::jsonb,
          25,
          'payments',
          '{}'::jsonb
        )
      `,
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505" &&
          "constraint_name" in error &&
          error.constraint_name === "data_backfill_runs_source_idx",
        ),
    );

    await assertConstraintViolation(
      client`
        UPDATE data_backfill_runs
        SET status = 'completed'
        WHERE id = ${run.id}
      `,
      "data_backfill_runs_state_check",
    );
  } finally {
    await client`
      DELETE FROM data_backfill_runs
      WHERE id = ${run.id}
    `;
  }
});
