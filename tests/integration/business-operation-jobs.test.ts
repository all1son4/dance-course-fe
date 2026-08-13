import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import {
  createEmailCampaignLeadInDatabase,
  excludeEmailCampaignLeadInDatabase,
  getCampaignEmailDeliveryDeduplicationKey,
} from "@/db/business-operation-jobs";
import { getDatabaseClient } from "@/db/client";
import { allocateInvoiceForPaymentIntent } from "@/db/invoice-repository";
import { claimOutboxJobByDeduplicationKey } from "@/db/transactional-outbox";

import { installJsonFetchFixture } from "../fixtures/providers";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.RESEND_API_KEY = "re_write06_fixture";

const client = postgres(databaseUrl, {
  max: 8,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const getBusinessOutbox = () => import("@/lib/business-operation-outbox");

const createCampaignLead = ({
  campaignKey,
  email,
  leadId,
}: {
  campaignKey: string;
  email: string;
  leadId: string;
}) =>
  createEmailCampaignLeadInDatabase({
    campaignKey,
    createdAt: new Date("2026-08-13T10:00:00.000Z"),
    email,
    fullName: "Write 06",
    leadId,
    locale: "en",
    socialContact: "@write06",
  });

const emailPayload = (to: string) => ({
  html: "<p>WRITE-06 fixture</p>",
  subject: "WRITE-06 fixture",
  text: "WRITE-06 fixture",
  to,
});

test("allocates and hydrates one invoice for a payment intent concurrently", async () => {
  const runId = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_write06_invoice_${runId}`;
  const issuedAt = new Date("2097-05-12T08:30:00.000Z");

  try {
    await client`
      INSERT INTO purchases (
        payment_intent_id,
        customer_email_snapshot,
        customer_full_name_snapshot,
        customer_address_line_snapshot,
        customer_city_snapshot,
        customer_postal_code_snapshot,
        amount_minor,
        currency,
        stripe_status,
        outcome
      ) VALUES (
        ${paymentIntentId},
        'buyer@example.com',
        'Invoice Buyer',
        'Street 1',
        'Warsaw',
        '00-001',
        7500,
        'pln',
        'succeeded',
        'succeeded'
      )
    `;

    const records = await Promise.all(
      Array.from({ length: 8 }, () =>
        allocateInvoiceForPaymentIntent({ issuedAt, paymentIntentId }),
      ),
    );
    const [stored] = await client<
      {
        amountMinor: number;
        buyerAddress: string;
        buyerEmail: string;
        buyerName: string;
        count: number;
      }[]
    >`
      SELECT
        count(*) OVER ()::int AS count,
        invoice.amount_minor AS "amountMinor",
        invoice.buyer_address_snapshot AS "buyerAddress",
        invoice.buyer_email_snapshot AS "buyerEmail",
        invoice.buyer_name_snapshot AS "buyerName"
      FROM invoices invoice
      INNER JOIN purchases purchase ON purchase.id = invoice.purchase_id
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.equal(new Set(records.map((record) => record.invoice_number)).size, 1);
    assert.match(records[0].invoice_number, /^FV\/2097\/05\/\d{3,}$/u);
    assert.deepEqual(stored, {
      amountMinor: 7500,
      buyerAddress: "Street 1, Warsaw, 00-001",
      buyerEmail: "buyer@example.com",
      buyerName: "Invoice Buyer",
      count: 1,
    });
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
  }
});

test("campaign jobs retry with one Resend idempotency key and persist final state", async (context) => {
  const runId = randomUUID().replaceAll("-", "");
  const campaignKey = `write06_campaign_${runId}`;
  const leadId = `lead_${runId}`;
  const email = `write06-${runId}@example.com`;
  const deduplicationKey = getCampaignEmailDeliveryDeduplicationKey({
    campaignKey,
    leadId,
  });
  const calls = installJsonFetchFixture(context, [
    { body: { message: "temporary" }, status: 500 },
    { body: { id: "email_write06_campaign" }, status: 200 },
  ]);

  try {
    const concurrentCreates = await Promise.all(
      Array.from({ length: 6 }, () => createCampaignLead({ campaignKey, email, leadId })),
    );
    const businessOutbox = await getBusinessOutbox();

    assert.equal(concurrentCreates.filter((result) => result.created).length, 1);

    await businessOutbox.enqueueCampaignEmailDelivery({
      campaignKey,
      deduplicationKey,
      email: emailPayload(email),
      leadId,
    });
    const first =
      await businessOutbox.processBusinessOperationOutboxJob(deduplicationKey);

    assert.equal(first.status, "retry");

    await businessOutbox.enqueueCampaignEmailDelivery({
      campaignKey,
      deduplicationKey,
      email: emailPayload(email),
      leadId,
    });
    const second =
      await businessOutbox.processBusinessOperationOutboxJob(deduplicationKey);
    const [stored] = await client<
      { attempts: number; jobStatus: string; leadStatus: string }[]
    >`
      SELECT
        lead.email_send_attempts AS attempts,
        lead.email_send_status AS "leadStatus",
        effect.status AS "jobStatus"
      FROM email_campaign_leads lead
      INNER JOIN purchase_side_effects effect
        ON effect.deduplication_key = ${deduplicationKey}
      WHERE lead.lead_id = ${leadId}
    `;

    assert.equal(second.status, "sent");
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].headers.get("Idempotency-Key"),
      `campaign-email/${deduplicationKey}`,
    );
    assert.equal(
      calls[1].headers.get("Idempotency-Key"),
      calls[0].headers.get("Idempotency-Key"),
    );
    assert.deepEqual(stored, {
      attempts: 2,
      jobStatus: "sent",
      leadStatus: "sent",
    });
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
    await client`
      DELETE FROM email_campaign_leads
      WHERE campaign_key = ${campaignKey}
    `;
  }
});

test("campaign exclusion cannot race an already claimed delivery", async () => {
  const runId = randomUUID().replaceAll("-", "");
  const campaignKey = `write06_exclusion_${runId}`;
  const leadId = `lead_${runId}`;
  const email = `write06-exclusion-${runId}@example.com`;
  const deduplicationKey = getCampaignEmailDeliveryDeduplicationKey({
    campaignKey,
    leadId,
  });

  try {
    await createCampaignLead({ campaignKey, email, leadId });
    const businessOutbox = await getBusinessOutbox();

    await businessOutbox.enqueueCampaignEmailDelivery({
      campaignKey,
      deduplicationKey,
      email: emailPayload(email),
      leadId,
    });

    const claim = await claimOutboxJobByDeduplicationKey({ deduplicationKey });
    const exclusion = await excludeEmailCampaignLeadInDatabase({
      campaignKey,
      leadId,
      scope: "global",
    });

    assert.ok(claim);
    assert.equal(exclusion.status, "delivery_in_progress");
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
    await client`
      DELETE FROM email_campaign_leads
      WHERE campaign_key = ${campaignKey}
    `;
  }
});

test("monthly report jobs persist delivery and never resend a completed job", async (context) => {
  const runId = randomUUID().replaceAll("-", "");
  const reportKey = `monthly_sales:2096-03-01:2096-04-01:${runId}`;
  const deduplicationKey = `monthly-report:${reportKey}:fixture-hash`;
  const recipient = `write06-report-${runId}@example.com`;
  const calls = installJsonFetchFixture(context, [
    { body: { id: "email_write06_report" }, status: 200 },
  ]);

  try {
    const businessOutbox = await getBusinessOutbox();

    await businessOutbox.enqueueMonthlyReportDelivery({
      deduplicationKey,
      email: {
        ...emailPayload(recipient),
        attachments: [{ content: "Y29udGVudA==", filename: "report.csv" }],
      },
      force: false,
      report: {
        csvSha256: "fixture-hash",
        deliveredAtUtc: "2096-04-01T00:00:00.000Z",
        deliveredTo: recipient,
        generatedAtUtc: "2096-04-01T00:00:00.000Z",
        periodEndUtc: "2096-04-01T00:00:00.000Z",
        periodStartUtc: "2096-03-01T00:00:00.000Z",
        reportFamily: "monthly_sales",
        reportKey,
        rowCount: 3,
      },
    });
    const first =
      await businessOutbox.processBusinessOperationOutboxJob(deduplicationKey);
    const second =
      await businessOutbox.processBusinessOperationOutboxJob(deduplicationKey);
    const [stored] = await client<
      { deliveredTo: string; rowCount: number; status: string }[]
    >`
      SELECT
        delivered_to AS "deliveredTo",
        row_count AS "rowCount",
        delivery_status AS status
      FROM monthly_report_runs
      WHERE report_key = ${reportKey}
    `;

    assert.equal(first.status, "sent");
    assert.equal(second.status, "empty");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].headers.get("Idempotency-Key"),
      `monthly-report/${deduplicationKey}`,
    );
    assert.deepEqual(stored, {
      deliveredTo: recipient,
      rowCount: 3,
      status: "sent",
    });
  } finally {
    await client`
      DELETE FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;
    await client`
      DELETE FROM monthly_report_runs
      WHERE report_key = ${reportKey}
    `;
  }
});
