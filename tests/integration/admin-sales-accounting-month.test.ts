import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getAdminPurchasesOverview, listAdminSalesMonths } from "@/db/admin-sales";
import { getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 4,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("loads and orders distinct Warsaw accounting months", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const augustPaymentIntentId = `pi_admin_sales_august_${suffix}`;
  const septemberPaymentIntentId = `pi_admin_sales_september_${suffix}`;

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        amount_minor,
        currency,
        stripe_status,
        outcome,
        source,
        succeeded_at,
        first_seen_at,
        created_at,
        updated_at
      ) VALUES
        (
          ${augustPaymentIntentId},
          1000,
          'pln',
          'succeeded',
          'succeeded',
          'stripe',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z',
          '2026-08-31T21:59:59.000Z'
        ),
        (
          ${septemberPaymentIntentId},
          2000,
          'pln',
          'succeeded',
          'succeeded',
          'stripe',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z',
          '2026-08-31T22:00:00.000Z'
        )
    `;

    const months = await listAdminSalesMonths();
    const augustOverview = await getAdminPurchasesOverview({
      monthValue: "2026-08",
      searchQuery: augustPaymentIntentId,
    });
    const septemberOverview = await getAdminPurchasesOverview({
      monthValue: "2026-09",
      searchQuery: septemberPaymentIntentId,
    });

    assert.ok(months.includes("2026-08"));
    assert.ok(months.includes("2026-09"));
    assert.ok(months.indexOf("2026-09") < months.indexOf("2026-08"));
    assert.equal(augustOverview.purchases[0]?.paymentIntentId, augustPaymentIntentId);
    assert.equal(
      septemberOverview.purchases[0]?.paymentIntentId,
      septemberPaymentIntentId,
    );
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (${augustPaymentIntentId}, ${septemberPaymentIntentId})
    `;
  }
});
