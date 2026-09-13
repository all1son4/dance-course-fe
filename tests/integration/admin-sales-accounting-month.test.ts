import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getAdminPurchasesOverview, listAdminSalesMonths } from "@/db/admin-sales";
import { getDatabaseClient } from "@/db/client";
import {
  countOutstandingPolishTerminalSales,
  setPolishSaleTerminalRecorded,
} from "@/db/polish-terminal-sales";

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

test("tracks terminal entry only for successful Polish Stripe sales", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const polishPaymentIntentId = `pi_terminal_poland_${suffix}`;
  const nonPolishPaymentIntentId = `pi_terminal_germany_${suffix}`;
  const failedPolishPaymentIntentId = `pi_terminal_failed_${suffix}`;
  const soldAt = "2042-04-12T10:00:00.000Z";

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        customer_country_snapshot,
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
          ${polishPaymentIntentId}, 'PL', 2500, 'pln', 'succeeded', 'succeeded',
          'stripe', ${soldAt}, ${soldAt}, ${soldAt}, ${soldAt}
        ),
        (
          ${nonPolishPaymentIntentId}, 'DE', 2500, 'pln', 'succeeded', 'succeeded',
          'stripe', ${soldAt}, ${soldAt}, ${soldAt}, ${soldAt}
        ),
        (
          ${failedPolishPaymentIntentId}, 'Polska', 2500, 'pln', 'failed', 'failed',
          'stripe', NULL, ${soldAt}, ${soldAt}, ${soldAt}
        )
    `;

    const overviewBefore = await getAdminPurchasesOverview({
      monthValue: "2042-04",
      searchQuery: polishPaymentIntentId,
    });

    assert.equal(overviewBefore.purchases[0]?.isPolish, true);
    assert.equal(overviewBefore.purchases[0]?.terminalRecordedAtIso, "");
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 1);

    const recordedAt = new Date("2042-04-20T08:15:00.000Z");
    const recorded = await setPolishSaleTerminalRecorded({
      now: recordedAt,
      paymentIntentId: polishPaymentIntentId,
      terminalRecorded: true,
    });

    assert.equal(recorded?.terminalRecordedAt?.toISOString(), recordedAt.toISOString());
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 0);
    assert.equal(
      await setPolishSaleTerminalRecorded({
        paymentIntentId: nonPolishPaymentIntentId,
        terminalRecorded: true,
      }),
      null,
    );
    assert.equal(
      await setPolishSaleTerminalRecorded({
        paymentIntentId: failedPolishPaymentIntentId,
        terminalRecorded: true,
      }),
      null,
    );

    const cleared = await setPolishSaleTerminalRecorded({
      paymentIntentId: polishPaymentIntentId,
      terminalRecorded: false,
    });

    assert.equal(cleared?.terminalRecordedAt, null);
    assert.equal(await countOutstandingPolishTerminalSales("2042-04"), 1);
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (
        ${polishPaymentIntentId},
        ${nonPolishPaymentIntentId},
        ${failedPolishPaymentIntentId}
      )
    `;
  }
});
