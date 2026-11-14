import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  type HubLaunchTransferInput,
  runHubLaunchTransfer,
} from "@/db/hub-launch-transfer";
import * as schema from "@/db/schema";

import { lockHubSettingsForTest } from "../helpers/hub-settings-lock";
import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 3, prepare: false });
const db = drizzle(client, { schema });

const run = randomUUID().slice(0, 8);
const COHORT_2_CHAT = `transfer_c2_${run}`;
const COHORT_3_CHAT = `transfer_c3_${run}`;
const HUB_CHAT = `transfer_hub_${run}`;
const [OWNER, OTHER] = createTestTelegramUserIdPair();
// Dates long past, so the cohorts never count as recent for other test files.
const INPUT: HubLaunchTransferInput = {
  cohort2: {
    title: "Online Group 2.0",
    mainChatId: COHORT_2_CHAT,
    startsAt: "2025-01-05T17:00:00.000Z",
  },
  cohort3: {
    title: "Online Group 3.0",
    mainChatId: COHORT_3_CHAT,
    startsAt: "2025-03-01T17:00:00.000Z",
  },
  hubChatId: HUB_CHAT,
  // 20 February 13:00 in Warsaw; access ends at 00:00 on 21 February (23:00 UTC).
  closeCohort2: { closedAt: "2025-02-20T12:00:00.000Z", lessonsCleared: true },
};
const purchaseIds = new Map<string, string>();
let previousHubChat: string | null = null;
let unlockHubSettings: (() => Promise<void>) | null = null;

async function insertLegacyPurchase(
  name: string,
  values: {
    chatId: string;
    outcome?: string;
    purchaseOwner?: string | null;
    primaryOwner?: string | null;
    bindingOwner?: string | null;
    plusHub?: boolean;
  },
) {
  const paymentIntentId = `pi_transfer_${name}_${run}`;
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status, outcome,
      telegram_user_id)
    VALUES (${paymentIntentId}, 5000, 'eur', 'succeeded', ${values.outcome ?? "succeeded"},
      ${values.purchaseOwner ?? null})
    RETURNING id
  `;
  assert.ok(purchase);
  purchaseIds.set(name, purchase.id);
  await client`INSERT INTO access_entitlements (purchase_id, access_key, status,
      telegram_chat_id, telegram_user_id)
    VALUES (${purchase.id}, 'primary', 'activated', ${values.chatId},
      ${values.primaryOwner ?? null})`;
  if (values.plusHub) {
    await client`INSERT INTO access_entitlements (purchase_id, access_key, status,
        telegram_chat_id)
      VALUES (${purchase.id}, 'inspiration-hub', 'activated', ${HUB_CHAT})`;
  }
  if (values.bindingOwner) {
    await client`INSERT INTO telegram_user_bindings (purchase_id, telegram_user_id, chat_id,
        bound_at, last_seen_at, status)
      VALUES (${purchase.id}, ${values.bindingOwner}, ${values.chatId}, now(), now(), 'active')`;
  }
}

before(async () => {
  unlockHubSettings = await lockHubSettingsForTest(client);
  for (const chatId of [COHORT_2_CHAT, COHORT_3_CHAT, HUB_CHAT]) {
    await client`INSERT INTO telegram_chats (chat_id, title, type)
      VALUES (${chatId}, ${chatId}, 'supergroup')`;
  }
  const [settings] = await client<{ telegram_chat_id: string }[]>`
    SELECT telegram_chat_id FROM inspiration_hub_settings`;
  previousHubChat = settings?.telegram_chat_id ?? null;
  await client`DELETE FROM inspiration_hub_settings`;

  // Plus #2 whose recorded IDs agree; Standard #2 with no ID; #2 with two IDs;
  // #3 bought before the release with its owner known; a failed #2 payment.
  await insertLegacyPurchase("plus", {
    chatId: COHORT_2_CHAT,
    primaryOwner: OWNER,
    bindingOwner: OWNER,
    plusHub: true,
  });
  await insertLegacyPurchase("standard", { chatId: COHORT_2_CHAT });
  await insertLegacyPurchase("conflict", {
    chatId: COHORT_2_CHAT,
    primaryOwner: OWNER,
    bindingOwner: OTHER,
  });
  await insertLegacyPurchase("next", { chatId: COHORT_3_CHAT, purchaseOwner: OTHER });
  await insertLegacyPurchase("failed", { chatId: COHORT_2_CHAT, outcome: "failed" });
});

after(async () => {
  await client`DELETE FROM purchases WHERE id = ANY(${[...purchaseIds.values()]})`;
  await client`DELETE FROM online_group_cohorts WHERE main_chat_id = ${COHORT_3_CHAT}`;
  await client`DELETE FROM online_group_cohorts WHERE main_chat_id = ${COHORT_2_CHAT}`;
  await client`DELETE FROM inspiration_hub_settings`;
  if (previousHubChat) {
    await client`INSERT INTO inspiration_hub_settings (telegram_chat_id)
      VALUES (${previousHubChat})`;
  }
  await client`DELETE FROM telegram_chats WHERE chat_id = ANY(${[COHORT_2_CHAT, COHORT_3_CHAT, HUB_CHAT]})`;
  await unlockHubSettings?.();
  await Promise.all([client.end(), applicationClient.end()]);
});

const readPurchase = async (name: string) => {
  const [row] = await client<
    {
      cohort: string | null;
      owner: string | null;
      primary_kind: string | null;
      primary_expires: string | null;
      hub_kind: string | null;
    }[]
  >`
    SELECT cohort.main_chat_id AS cohort, purchase.telegram_user_id AS owner,
      primary_right.source_kind AS primary_kind, to_char(primary_right.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS primary_expires,
      hub_right.source_kind AS hub_kind
    FROM purchases purchase
    LEFT JOIN online_group_cohorts cohort ON cohort.id = purchase.online_group_cohort_id
    LEFT JOIN access_entitlements primary_right
      ON primary_right.purchase_id = purchase.id AND primary_right.access_key = 'primary'
    LEFT JOIN access_entitlements hub_right
      ON hub_right.purchase_id = purchase.id AND hub_right.access_key = 'inspiration-hub'
    WHERE purchase.id = ${purchaseIds.get(name) ?? ""}
  `;
  assert.ok(row);
  return row;
};

const countCohorts = async () => {
  const [row] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM online_group_cohorts
    WHERE main_chat_id = ANY(${[COHORT_2_CHAT, COHORT_3_CHAT]})`;
  return row?.count ?? 0;
};

test("bad input is refused before anything is read or written", async () => {
  await assert.rejects(
    runHubLaunchTransfer(db, {
      input: { ...INPUT, closeCohort2: { ...INPUT.closeCohort2, lessonsCleared: false } },
      write: true,
    }),
    /hub_launch_transfer_lessons_not_confirmed/u,
  );
  await assert.rejects(
    runHubLaunchTransfer(db, {
      input: { ...INPUT, hubChatId: `unregistered_${run}` },
      write: true,
    }),
    /hub_launch_transfer_chats_not_registered/u,
  );
  assert.equal(await countCohorts(), 0);
});

test("a dry run reports the whole transfer and keeps nothing", async () => {
  const report = await runHubLaunchTransfer(db, { input: INPUT, write: false });

  assert.equal(report.written, false);
  assert.equal(report.cohorts.cohort2.created, true);
  assert.equal(report.hubSettings, "created");
  assert.equal(report.purchases.linked, 4);
  assert.equal(report.purchases.ownersWritten, 1);
  assert.deepEqual(
    report.purchases.withoutOwner.map((entry) => entry.paymentIntentId),
    [`pi_transfer_standard_${run}`],
  );
  assert.deepEqual(
    report.purchases.ownerConflicts.map((entry) => entry.paymentIntentId),
    [`pi_transfer_conflict_${run}`],
  );
  assert.equal(report.closure.accessEndsAt, "2025-02-20T23:00:00.000Z");
  assert.equal(report.closure.nextCohortSalesOpened, true);

  assert.equal(await countCohorts(), 0);
  assert.deepEqual(await readPurchase("plus"), {
    cohort: null,
    owner: null,
    primary_kind: null,
    primary_expires: null,
    hub_kind: null,
  });
  const [settings] = await client`SELECT 1 FROM inspiration_hub_settings`;
  assert.equal(settings, undefined);
});

test("the real run creates the cohorts, links purchases and closes cohort #2", async () => {
  const report = await runHubLaunchTransfer(db, { input: INPUT, write: true });
  assert.equal(report.written, true);

  const cohorts = await client<
    {
      main_chat_id: string;
      previous: string | null;
      closed: boolean;
      sales_enabled: boolean;
    }[]
  >`
    SELECT cohort.main_chat_id, previous.main_chat_id AS previous,
      cohort.closed_at IS NOT NULL AS closed, cohort.sales_enabled
    FROM online_group_cohorts cohort
    LEFT JOIN online_group_cohorts previous ON previous.id = cohort.previous_cohort_id
    WHERE cohort.main_chat_id = ANY(${[COHORT_2_CHAT, COHORT_3_CHAT]})
    ORDER BY cohort.starts_at
  `;
  assert.deepEqual(
    cohorts.map((row) => ({ ...row })),
    [
      { main_chat_id: COHORT_2_CHAT, previous: null, closed: true, sales_enabled: false },
      {
        main_chat_id: COHORT_3_CHAT,
        previous: COHORT_2_CHAT,
        closed: false,
        sales_enabled: true,
      },
    ],
  );

  // The Plus right keeps its old-model Hub; its main right ends with the closure.
  assert.deepEqual(await readPurchase("plus"), {
    cohort: COHORT_2_CHAT,
    owner: OWNER,
    primary_kind: "online_group",
    primary_expires: "2025-02-20T23:00",
    hub_kind: null,
  });
  assert.equal((await readPurchase("standard")).owner, null);
  assert.equal((await readPurchase("conflict")).owner, null);
  assert.equal((await readPurchase("next")).cohort, COHORT_3_CHAT);
  assert.equal((await readPurchase("next")).owner, OTHER);
  assert.equal((await readPurchase("failed")).cohort, null);
  const [settings] = await client<{ telegram_chat_id: string }[]>`
    SELECT telegram_chat_id FROM inspiration_hub_settings`;
  assert.equal(settings?.telegram_chat_id, HUB_CHAT);
});

test("running it again changes nothing", async () => {
  const report = await runHubLaunchTransfer(db, { input: INPUT, write: true });

  assert.equal(report.cohorts.cohort2.created, false);
  assert.equal(report.cohorts.cohort3.created, false);
  assert.equal(report.hubSettings, "unchanged");
  assert.equal(report.purchases.linked, 0);
  assert.equal(report.purchases.alreadyLinked, 4);
  assert.equal(report.purchases.ownersWritten, 0);
  assert.equal(report.closure.alreadyClosed, true);
  assert.equal(await countCohorts(), 2);
});
