import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before, beforeEach } from "node:test";

import postgres from "postgres";

import type { OnlineGroupConfigurationReport } from "@/db/online-group-configuration-report";
import type { OnlineGroupPurchaseReport } from "@/db/online-group-purchase-report";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const projectRoot = process.cwd();
const moduleRequire = createRequire(path.join(projectRoot, "package.json"));
const loader = moduleRequire.resolve("tsx");
const entrypoint = path.join(projectRoot, "src/db/audit-online-group-configuration.ts");
const workDirectory = mkdtempSync(path.join(tmpdir(), "dance-course-hub-audit-cli-"));
const fixtureSchema = `hub_audit_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = getRequiredTestDatabaseUrl();
const scopedUrl = new URL(databaseUrl);
scopedUrl.searchParams.set("search_path", fixtureSchema);

const client = postgres(databaseUrl, { connect_timeout: 5, max: 1, prepare: false });
const failureMessage =
  "online_group_configuration_audit_failed; verify explicit DATABASE_ENV, scoped connection and schema\n";

before(async () => {
  await client`CREATE SCHEMA ${client(fixtureSchema)}`;
  for (const table of [
    "telegram_chats",
    "online_group_campaigns",
    "online_group_cohorts",
    "inspiration_hub_settings",
    "purchases",
    "access_entitlements",
    "telegram_user_bindings",
    "telegram_access_tokens",
  ]) {
    await client`CREATE TABLE ${client(fixtureSchema)}.${client(table)}
      (LIKE public.${client(table)} INCLUDING ALL)`;
  }
});

beforeEach(async () => {
  await client`TRUNCATE
    ${client(fixtureSchema)}.telegram_access_tokens,
    ${client(fixtureSchema)}.telegram_user_bindings,
    ${client(fixtureSchema)}.access_entitlements,
    ${client(fixtureSchema)}.purchases,
    ${client(fixtureSchema)}.online_group_campaigns,
    ${client(fixtureSchema)}.online_group_cohorts,
    ${client(fixtureSchema)}.inspiration_hub_settings,
    ${client(fixtureSchema)}.telegram_chats`;
});

after(async () => {
  try {
    await client`DROP SCHEMA IF EXISTS ${client(fixtureSchema)} CASCADE`;
  } finally {
    await client.end({ timeout: 5 });
    rmSync(workDirectory, { recursive: true, force: true });
  }
});

function runAudit(
  overrides: Readonly<Record<string, string | undefined>>,
  args: readonly string[] = [],
) {
  // Neither inherited connection aliases nor the project's .env files can select
  // a shared DB, including in tests that deliberately choose production mode.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/^(?:DATABASE(?:_|$)|POSTGRES(?:_|$)|PG|DB_ENV$|VERCEL_ENV$|NODE_ENV$)/u.test(
          name,
        ),
    ),
  );
  const result = spawnSync(process.execPath, ["--import", loader, entrypoint, ...args], {
    cwd: workDirectory,
    encoding: "utf8",
    env: {
      ...environment,
      NODE_ENV: "development",
      TSX_TSCONFIG_PATH: path.join(projectRoot, "tsconfig.json"),
      ...overrides,
    },
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  });

  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  assert.notEqual(result.status, null);
  return result;
}

type Serialized<Value> = Value extends Date
  ? string
  : Value extends readonly (infer Item)[]
    ? Serialized<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: Serialized<Value[Key]> }
      : Value;

type AuditDocumentBase = {
  database: {
    deploymentEnvironment: "development" | "production";
    kind: "unpooled";
    variableName: string;
  };
  capturedAt: string;
  scope: string;
  report: unknown;
};

type AuditDocument = Omit<AuditDocumentBase, "scope" | "report"> & {
  scope: "configuration_inventory_only";
  report: Serialized<OnlineGroupConfigurationReport>;
};

type ReconciliationAuditDocument = Omit<AuditDocumentBase, "scope" | "report"> & {
  scope: "configuration_and_purchase_inventory_only";
  report: {
    configuration: Serialized<OnlineGroupConfigurationReport>;
    purchases: Serialized<OnlineGroupPurchaseReport>;
  };
};

function readSuccessfulDocument(result: ReturnType<typeof runAudit>): AuditDocumentBase {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(
    result.stdout,
    /postgres(?:ql)?:\/\/|registered_by|private_|example\.test|https:\/\/t\.me/iu,
  );
  const document = JSON.parse(result.stdout) as AuditDocumentBase;
  assert.ok(Number.isFinite(new Date(document.capturedAt).getTime()));
  assert.deepEqual(Object.keys(document).sort(), [
    "capturedAt",
    "database",
    "report",
    "scope",
  ]);
  return document;
}

function readSuccessfulAudit(result: ReturnType<typeof runAudit>): AuditDocument {
  const document = readSuccessfulDocument(result) as AuditDocument;
  assert.equal(document.scope, "configuration_inventory_only");
  return document;
}

function readSuccessfulReconciliationAudit(
  result: ReturnType<typeof runAudit>,
): ReconciliationAuditDocument {
  const document = readSuccessfulDocument(result) as ReconciliationAuditDocument;
  assert.equal(document.scope, "configuration_and_purchase_inventory_only");
  assert.deepEqual(Object.keys(document.report).sort(), ["configuration", "purchases"]);
  return document;
}

function assertFailure(result: ReturnType<typeof runAudit>): void {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, failureMessage);
}

test("configuration audit CLI: emits a development JSON report and exits with its client closed", () => {
  const document = readSuccessfulAudit(
    runAudit({
      DATABASE_ENV: "development",
      DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
    }),
  );

  assert.deepEqual(document.database, {
    deploymentEnvironment: "development",
    kind: "unpooled",
    variableName: "DATABASE_DEV_DATABASE_URL_UNPOOLED",
  });
  assert.deepEqual(document.report, {
    groups: [],
    chats: [],
    cohortsWithoutCampaigns: [],
    hubSettings: null,
    hubChat: null,
    hubIssues: ["hub_settings_missing"],
  });
});

test("configuration audit CLI: production mode uses only the explicitly supplied loopback test URL", () => {
  const document = readSuccessfulAudit(
    runAudit({
      DATABASE_ENV: "production",
      DATABASE_PROD_DATABASE_URL_UNPOOLED: scopedUrl.href,
    }),
  );

  assert.deepEqual(document.database, {
    deploymentEnvironment: "production",
    kind: "unpooled",
    variableName: "DATABASE_PROD_DATABASE_URL_UNPOOLED",
  });
});

test("configuration audit CLI: review notes remain a successful inventory and stored rows are preserved", async () => {
  await client`INSERT INTO ${client(fixtureSchema)}.telegram_chats
    (chat_id, title, type, is_active, registered_by_telegram_username)
    VALUES ('main-a', 'Group A', 'supergroup', false, 'private_registrar'),
      ('hub-a', 'Hub A', 'supergroup', true, 'private_registrar')`;
  await client`INSERT INTO ${client(fixtureSchema)}.online_group_campaigns
    (title, regular_chat_id, library_chat_id, starts_at, status)
    VALUES ('Recorded Online', 'main-a', 'hub-a', '2026-09-01T10:00:00Z', 'active')`;

  const readRows = async () => ({
    chats:
      await client`SELECT * FROM ${client(fixtureSchema)}.telegram_chats ORDER BY chat_id`,
    campaigns:
      await client`SELECT * FROM ${client(fixtureSchema)}.online_group_campaigns ORDER BY id`,
    cohorts:
      await client`SELECT * FROM ${client(fixtureSchema)}.online_group_cohorts ORDER BY id`,
    settings:
      await client`SELECT * FROM ${client(fixtureSchema)}.inspiration_hub_settings`,
  });
  const before = await readRows();
  const document = readSuccessfulAudit(
    runAudit({
      DATABASE_ENV: "development",
      DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
    }),
  );

  assert.equal(document.report.groups.length, 1);
  assert.deepEqual(document.report.groups[0].issues, [
    "main_chat_inactive",
    "cohort_missing",
  ]);
  assert.deepEqual(document.report.hubIssues, ["hub_settings_missing"]);
  assert.equal(
    document.report.groups[0].campaigns[0].startsAt,
    "2026-09-01T10:00:00.000Z",
  );
  assert.deepEqual(await readRows(), before);
});

test("configuration audit CLI: an available connection does not permit an omitted target", () => {
  assertFailure(runAudit({ DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href }));
});

test("configuration audit CLI: rejects aliases and unknown targets instead of inferring development", () => {
  for (const target of ["dev", "staging", ""]) {
    assertFailure(
      runAudit({
        DATABASE_ENV: target,
        DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
      }),
    );
  }
});

test("configuration audit CLI: .env files cannot supply the required explicit target", () => {
  const envPath = path.join(workDirectory, ".env.local");
  writeFileSync(envPath, "DATABASE_ENV=development\n");

  try {
    assertFailure(runAudit({ DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href }));
  } finally {
    rmSync(envPath, { force: true });
  }
});

test("configuration audit CLI: rejects standard fallback URLs for either target", () => {
  for (const target of ["development", "production"]) {
    assertFailure(
      runAudit({ DATABASE_ENV: target, DATABASE_URL_UNPOOLED: scopedUrl.href }),
    );
  }
});

test("configuration audit CLI: a query error produces no successful JSON or driver details", () => {
  const missingSchemaUrl = new URL(scopedUrl);
  missingSchemaUrl.searchParams.set("search_path", `${fixtureSchema}_missing`);

  assertFailure(
    runAudit({
      DATABASE_ENV: "development",
      DATABASE_DEV_DATABASE_URL_UNPOOLED: missingSchemaUrl.href,
    }),
  );
});

test("reconciliation audit CLI: include-purchases emits both complete reports for development", () => {
  const document = readSuccessfulReconciliationAudit(
    runAudit(
      {
        DATABASE_ENV: "development",
        DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
      },
      ["--include-purchases"],
    ),
  );

  assert.deepEqual(document.database, {
    deploymentEnvironment: "development",
    kind: "unpooled",
    variableName: "DATABASE_DEV_DATABASE_URL_UNPOOLED",
  });
  assert.deepEqual(document.report.configuration, {
    groups: [],
    chats: [],
    cohortsWithoutCampaigns: [],
    hubSettings: null,
    hubChat: null,
    hubIssues: ["hub_settings_missing"],
  });
  assert.deepEqual(document.report.purchases, {
    purchases: [],
    recordsWithoutPurchase: {
      entitlements: [],
      bindings: [],
      tokens: [],
      tokenIssues: [],
    },
  });
});

test("reconciliation audit CLI: production mode still uses only an explicit loopback fixture connection", () => {
  const document = readSuccessfulReconciliationAudit(
    runAudit(
      {
        DATABASE_ENV: "production",
        DATABASE_PROD_DATABASE_URL_UNPOOLED: scopedUrl.href,
      },
      ["--include-purchases"],
    ),
  );

  assert.deepEqual(document.database, {
    deploymentEnvironment: "production",
    kind: "unpooled",
    variableName: "DATABASE_PROD_DATABASE_URL_UNPOOLED",
  });
});

test("reconciliation audit CLI: real fixture facts and review issues succeed without exposing secrets or modifying rows", async () => {
  const purchaseId = "10000000-0000-4000-8000-000000000001";
  const entitlementId = "20000000-0000-4000-8000-000000000001";
  await client`INSERT INTO ${client(fixtureSchema)}.telegram_chats
    (chat_id, title, type, is_active, registered_by_telegram_username)
    VALUES ('main-a', 'Group A', 'supergroup', true, 'private_registrar'),
      ('hub-a', 'Hub A', 'supergroup', true, 'private_registrar')`;
  await client`INSERT INTO ${client(fixtureSchema)}.online_group_campaigns
    (title, regular_chat_id, library_chat_id, starts_at, status)
    VALUES ('Recorded Group', 'main-a', 'hub-a', '2026-09-01T10:00:00Z', 'active')`;
  await client`INSERT INTO ${client(fixtureSchema)}.purchases
    (id, payment_intent_id, product_external_id, offer_external_id,
      amount_minor, currency, stripe_status, outcome, telegram_user_id,
      customer_email_snapshot, succeeded_at)
    VALUES (${purchaseId}, 'pi_cli_reconciliation_fixture', 'online-group', 'online-group-plus',
      4000, 'eur', 'succeeded', 'succeeded', '123', 'private@example.test',
      '2026-08-31T10:00:00Z')`;
  await client`INSERT INTO ${client(fixtureSchema)}.access_entitlements
    (id, purchase_id, access_key, telegram_chat_id, telegram_user_id, status)
    VALUES (${entitlementId}, ${purchaseId}, 'primary', 'main-a', '123', 'activated')`;
  await client`INSERT INTO ${client(fixtureSchema)}.telegram_user_bindings
    (purchase_id, entitlement_id, telegram_user_id, chat_id, status, bound_at,
      last_seen_at, invite_link)
    VALUES (${purchaseId}, ${entitlementId}, '123', 'main-a', 'active',
      '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z', 'https://t.me/+private_invitation')`;
  await client`INSERT INTO ${client(fixtureSchema)}.telegram_access_tokens
    (token_id, token_hash, token_value, purchase_id, entitlement_id, link_kind,
      chat_id, status, expires_at, used_at, telegram_user_id)
    VALUES ('private_token_a', 'private_hash_a', 'https://t.me/+private_invitation',
      ${purchaseId}, ${entitlementId}, 'channel_invite', 'main-a', 'used',
      '2026-10-01T10:00:00Z', '2026-09-01T10:00:00Z', '123'),
      ('private_token_b', 'private_hash_b', 'https://t.me/+private_invitation',
      ${purchaseId}, ${entitlementId}, 'channel_invite', 'main-a', 'used',
      '2026-10-01T10:00:00Z', null, '777')`;

  const readRows = async () => {
    const rows: Record<string, readonly unknown[]> = {};
    for (const table of [
      "telegram_chats",
      "online_group_campaigns",
      "online_group_cohorts",
      "inspiration_hub_settings",
      "purchases",
      "access_entitlements",
      "telegram_user_bindings",
      "telegram_access_tokens",
    ]) {
      const key = table === "telegram_chats" ? "chat_id" : "id";
      rows[table] =
        await client`SELECT * FROM ${client(fixtureSchema)}.${client(table)} ORDER BY ${client(key)}`;
    }
    return rows;
  };
  const before = await readRows();
  const document = readSuccessfulReconciliationAudit(
    runAudit(
      {
        DATABASE_ENV: "development",
        DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
      },
      ["--include-purchases"],
    ),
  );

  assert.deepEqual(document.report.configuration.groups[0].issues, ["cohort_missing"]);
  assert.deepEqual(document.report.configuration.hubIssues, ["hub_settings_missing"]);
  const [entry] = document.report.purchases.purchases;
  assert.equal(entry.purchase.id, purchaseId);
  assert.equal(entry.identity.status, "consistent");
  assert.equal(entry.identity.telegramUserId, "123");
  assert.equal(entry.tokens.length, 2);
  assert.deepEqual(
    entry.tokenIssues.map((issue) => issue.code),
    ["token_use_timestamp_missing"],
  );
  assert.equal(entry.purchase.succeededAt, "2026-08-31T10:00:00.000Z");
  assert.deepEqual(await readRows(), before);
});

test("reconciliation audit CLI: purchase-side query failure cannot emit a partial configuration report", async () => {
  await client`ALTER TABLE ${client(fixtureSchema)}.telegram_access_tokens RENAME COLUMN used_at TO unavailable_used_at`;
  const environment = {
    DATABASE_ENV: "development",
    DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
  };
  try {
    assertFailure(runAudit(environment, ["--include-purchases"]));
    readSuccessfulAudit(runAudit(environment));
  } finally {
    await client`ALTER TABLE ${client(fixtureSchema)}.telegram_access_tokens RENAME COLUMN unavailable_used_at TO used_at`;
  }
});

test("reconciliation audit CLI: explicit target and scoped connection remain required", () => {
  for (const environment of [
    { DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href },
    { DATABASE_ENV: "preview", DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href },
    { DATABASE_ENV: "development", DATABASE_URL_UNPOOLED: scopedUrl.href },
    { DATABASE_ENV: "production", DATABASE_URL_UNPOOLED: scopedUrl.href },
  ]) {
    assertFailure(runAudit(environment, ["--include-purchases"]));
  }
});

test("configuration audit CLI: unknown and repeated options fail instead of silently choosing a mode", () => {
  for (const args of [
    ["--unexpected"],
    ["--include-purchase"],
    ["--include-purchases", "--include-purchases"],
    ["--include-purchases", "--unexpected"],
  ]) {
    assertFailure(
      runAudit(
        {
          DATABASE_ENV: "development",
          DATABASE_DEV_DATABASE_URL_UNPOOLED: scopedUrl.href,
        },
        args,
      ),
    );
  }
});
