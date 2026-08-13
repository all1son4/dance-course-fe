import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import { listAdminInviteLinkHistoryRecords } from "@/lib/admin-invite-link-history-read-runtime";
import { createAdminOfferGrant } from "@/lib/admin-offer-grants";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 8,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const restoreEnvironmentVariable = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

const configureDatabaseOnlyAdminOffers = (context: TestContext) => {
  const previousBusinessMode = process.env.DB_BUSINESS_OPERATIONS_MODE;
  const previousExportMode = process.env.DB_SHEETS_EXPORT_MODE;
  const previousTelegramMode = process.env.DB_TELEGRAM_ACCESS_MODE;
  const previousGooglePrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const previousGoogleEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const previousGoogleSheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  process.env.DB_BUSINESS_OPERATIONS_MODE = "database";
  process.env.DB_SHEETS_EXPORT_MODE = "legacy";
  process.env.DB_TELEGRAM_ACCESS_MODE = "database";
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  context.after(() => {
    restoreEnvironmentVariable("DB_BUSINESS_OPERATIONS_MODE", previousBusinessMode);
    restoreEnvironmentVariable("DB_SHEETS_EXPORT_MODE", previousExportMode);
    restoreEnvironmentVariable("DB_TELEGRAM_ACCESS_MODE", previousTelegramMode);
    restoreEnvironmentVariable("GOOGLE_PRIVATE_KEY", previousGooglePrivateKey);
    restoreEnvironmentVariable("GOOGLE_SERVICE_ACCOUNT_EMAIL", previousGoogleEmail);
    restoreEnvironmentVariable("GOOGLE_SHEETS_SPREADSHEET_ID", previousGoogleSheetId);
  });
};

test("creates and reads one atomic admin grant and export job without Google credentials", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const productExternalId = `prd_write05_${suffix}`;
  const offerExternalId = `off_write05_${suffix}`;
  const paymentIntentId = `adm_offer_pi_${suffix}`;
  const checkoutSessionId = `adm_offer_cs_${suffix}`;
  const eventId = `adm_offer_evt_${suffix}`;

  configureDatabaseOnlyAdminOffers(t);

  try {
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (
        code,
        external_product_id,
        slug,
        type,
        title,
        description,
        description_keys
      ) VALUES (
        ${`write05-${suffix}`},
        ${productExternalId},
        ${`write05-${suffix}`},
        'course',
        'WRITE-05 fixture',
        '[]'::jsonb,
        '[]'::jsonb
      )
      RETURNING id
    `;

    assert.ok(product);

    await client`
      INSERT INTO product_offers (
        external_offer_id,
        product_id,
        code,
        label,
        delivery_channel,
        access_workflow
      ) VALUES (
        ${offerExternalId},
        ${product.id},
        'standard',
        'WRITE-05 access',
        'telegram',
        'admin-offer-link'
      )
    `;

    const command = {
      accessWorkflow: "admin-offer-link",
      adminLabel: "WRITE-05 admin",
      checkoutSessionId,
      createdAt: new Date("2026-08-13T10:00:00.000Z"),
      eventId,
      lessonLanguage: "en" as const,
      offerExternalId,
      offerLabel: "WRITE-05 access",
      paymentIntentId,
      productExternalId,
      productTitle: "WRITE-05 fixture",
      purchaseItem: "WRITE-05 fixture — WRITE-05 access",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createAdminOfferGrant(command)),
    );
    const tokenId = `tgi_read05_${suffix}`;
    const accessUrl = `https://t.me/+read05_${suffix}`;
    const tokenExpiresAt = new Date("2026-09-13T10:00:00.000Z");
    const tokenUsedAt = new Date("2026-08-13T10:03:00.000Z");
    const [accessOwner] = await client<
      {
        entitlementId: string;
        offerId: string;
        productId: string;
        purchaseId: string;
      }[]
    >`
      SELECT
        entitlement.id AS "entitlementId",
        purchase.offer_id AS "offerId",
        purchase.product_id AS "productId",
        purchase.id AS "purchaseId"
      FROM purchases purchase
      INNER JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
        AND entitlement.access_key = 'primary'
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.ok(accessOwner);

    await client`
      INSERT INTO telegram_access_tokens (
        token_id,
        token_hash,
        token_value,
        purchase_id,
        entitlement_id,
        product_id,
        offer_id,
        link_kind,
        status,
        expires_at,
        used_at,
        telegram_user_id,
        created_at,
        updated_at
      ) VALUES (
        ${tokenId},
        ${`hash_${suffix}`},
        ${accessUrl},
        ${accessOwner.purchaseId},
        ${accessOwner.entitlementId},
        ${accessOwner.productId},
        ${accessOwner.offerId},
        'channel_invite',
        'used',
        ${tokenExpiresAt},
        '2026-08-13T10:02:00.000Z',
        ${`read05_user_${suffix}`},
        '2026-08-13T10:01:00.000Z',
        '2026-08-13T10:02:00.000Z'
      )
    `;
    await client`
      UPDATE access_entitlements
      SET
        current_token_id = ${tokenId},
        starts_at = ${tokenUsedAt},
        status = 'activated',
        updated_at = ${tokenUsedAt}
      WHERE id = ${accessOwner.entitlementId}
    `;

    await assert.rejects(
      createAdminOfferGrant({
        ...command,
        checkoutSessionId: `adm_offer_cs_conflict_${suffix}`,
      }),
      /admin_offer_grant_idempotency_conflict/u,
    );

    const [stored] = await client<
      {
        amountMinor: number;
        entitlementCount: number;
        entitlementStatus: string;
        exportCount: number;
        exportSource: string;
        exportStatus: string;
        outcome: string;
        purchaseCount: number;
        source: string;
        succeededAt: Date | null;
      }[]
    >`
      SELECT
        max(purchase.amount_minor)::int AS "amountMinor",
        count(DISTINCT entitlement.id)::int AS "entitlementCount",
        max(entitlement.status) AS "entitlementStatus",
        count(DISTINCT effect.id)::int AS "exportCount",
        max(effect.payload->>'source') AS "exportSource",
        max(effect.status) AS "exportStatus",
        max(purchase.outcome) AS outcome,
        count(DISTINCT purchase.id)::int AS "purchaseCount",
        max(purchase.source) AS source,
        max(purchase.succeeded_at) AS "succeededAt"
      FROM purchases purchase
      LEFT JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
      LEFT JOIN purchase_side_effects effect
        ON effect.purchase_id = purchase.id
        AND effect.kind = 'successful_customer_export'
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;
    const history = await listAdminInviteLinkHistoryRecords(
      { accessWorkflow: "admin-offer-link" },
      { environment: { DB_BUSINESS_OPERATIONS_MODE: "database" } },
    );
    const historyRecord = history.find((record) => record.accessUrl === accessUrl);

    assert.equal(results.length, 8);
    assert.ok(
      results.every(
        (record) =>
          record.payment_intent_id === paymentIntentId &&
          record.successful_customer_log_status === "pending",
      ),
    );
    assert.deepEqual(stored, {
      amountMinor: 0,
      entitlementCount: 1,
      entitlementStatus: "pending",
      exportCount: 1,
      exportSource: "admin_offer_link",
      exportStatus: "pending",
      outcome: "succeeded",
      purchaseCount: 1,
      source: "admin_offer_link",
      succeededAt: null,
    });
    assert.deepEqual(historyRecord, {
      accessUrl,
      adminLabel: "WRITE-05 admin",
      createdAt: "2026-08-13T10:00:00.000Z",
      lessonLanguage: "en",
      offerLabel: "WRITE-05 access",
      productTitle: "WRITE-05 fixture",
      purchaseItem: "WRITE-05 fixture — WRITE-05 access",
      tokenExpiresAt: tokenExpiresAt.toISOString(),
      tokenUsedAt: tokenUsedAt.toISOString(),
    });
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
    await client`
      DELETE FROM products
      WHERE external_product_id = ${productExternalId}
    `;
  }
});

test("creates a DB-native Online Group grant with the export retired", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const productExternalId = `prd_write05_no_export_${suffix}`;
  const offerExternalId = `off_write05_no_export_${suffix}`;
  const paymentIntentId = `adm_offer_pi_no_export_${suffix}`;

  configureDatabaseOnlyAdminOffers(t);
  process.env.DB_SHEETS_EXPORT_MODE = "database";
  process.env.DB_TELEGRAM_ACCESS_MODE = "legacy";

  try {
    const [product] = await client<{ id: string }[]>`
      INSERT INTO products (
        code,
        external_product_id,
        slug,
        type,
        title,
        description,
        description_keys
      ) VALUES (
        ${`write05-no-export-${suffix}`},
        ${productExternalId},
        ${`write05-no-export-${suffix}`},
        'course',
        'WRITE-05 no-export fixture',
        '[]'::jsonb,
        '[]'::jsonb
      )
      RETURNING id
    `;

    assert.ok(product);

    await client`
      INSERT INTO product_offers (
        external_offer_id,
        product_id,
        code,
        label,
        delivery_channel,
        access_workflow
      ) VALUES (
        ${offerExternalId},
        ${product.id},
        'standard',
        'WRITE-05 no-export access',
        'telegram',
        'admin-offer-link'
      )
    `;

    const mainChatId = `-100${suffix.slice(0, 12)}`;
    const inspirationChatId = `-200${suffix.slice(0, 12)}`;
    const paymentRecord = await createAdminOfferGrant({
      accessWorkflow: "telegram-online-group",
      adminLabel: "WRITE-05 admin",
      checkoutSessionId: `adm_offer_cs_no_export_${suffix}`,
      createdAt: new Date("2026-08-13T10:05:00.000Z"),
      eventId: `adm_offer_evt_no_export_${suffix}`,
      inspirationChatId,
      lessonLanguage: "ru",
      mainChatId,
      offerExternalId,
      offerLabel: "WRITE-05 no-export access",
      paymentIntentId,
      productExternalId,
      productTitle: "WRITE-05 no-export fixture",
      purchaseItem: "WRITE-05 no-export fixture",
    });
    const [stored] = await client<
      {
        accessWorkflow: string;
        exportCount: number;
        inspirationChatId: string;
        mainChatId: string;
      }[]
    >`
      SELECT
        max(entitlement.access_workflow) AS "accessWorkflow",
        count(effect.id)::int AS "exportCount",
        max(purchase.inspiration_chat_id_snapshot) AS "inspirationChatId",
        max(entitlement.telegram_chat_id) AS "mainChatId"
      FROM purchases purchase
      JOIN access_entitlements entitlement
        ON entitlement.purchase_id = purchase.id
        AND entitlement.access_key = 'primary'
      LEFT JOIN purchase_side_effects effect
        ON effect.purchase_id = purchase.id
        AND effect.kind = 'successful_customer_export'
      WHERE purchase.payment_intent_id = ${paymentIntentId}
    `;

    assert.equal(paymentRecord.payment_intent_id, paymentIntentId);
    assert.equal(paymentRecord.successful_customer_log_status, "");
    assert.deepEqual(stored, {
      accessWorkflow: "telegram-online-group",
      exportCount: 0,
      inspirationChatId,
      mainChatId,
    });
  } finally {
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id = ${paymentIntentId}
    `;
    await client`
      DELETE FROM products
      WHERE external_product_id = ${productExternalId}
    `;
  }
});
