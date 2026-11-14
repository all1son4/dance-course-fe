import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import postgres from "postgres";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "cohort-closure-admin-test-token";
process.env.ALLOW_TEST_MODE_NOTIFICATIONS = "1";

const client = postgres(databaseUrl, { max: 2, prepare: false });

let admin: typeof import("@/lib/online-group/cohort-admin");
let closeApplicationClient: () => Promise<void>;

before(async () => {
  admin = await import("@/lib/online-group/cohort-admin");
  const { getDatabaseClient } = await import("@/db/client");
  closeApplicationClient = () => getDatabaseClient().end();
});

after(async () => {
  await Promise.all([client.end(), closeApplicationClient?.()]);
});

type Call = { method: string; body: Record<string, unknown> };

const stubTelegram = (
  context: import("node:test").TestContext,
  { failSend = false }: { failSend?: boolean } = {},
) => {
  const calls: Call[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = String(url).split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, body });
      if (failSend && method === "sendMessage") {
        return Response.json(
          { ok: false, error_code: 403, description: "Forbidden: bot was kicked" },
          { status: 403 },
        );
      }
      return Response.json({
        ok: true,
        result: method === "sendMessage" ? { message_id: 4242 } : true,
      });
    },
  );
  return calls;
};

/** Cohort #3 open with a successor #4 and renewal links from #3's chat into #4. */
async function withCohorts(
  run: (fixture: {
    cohortId: string;
    nextId: string;
    chatId: string;
    nextChatId: string;
  }) => Promise<void>,
) {
  const suffix = randomUUID();
  const chatId = `cohort_admin_${suffix}`;
  const nextChatId = `cohort_admin_next_${suffix}`;
  const slugs = [`rnw_plus_${suffix}`, `rnw_std_${suffix}`];
  await client`INSERT INTO telegram_chats (chat_id, title, type) VALUES
    (${chatId}, 'Online Group 3.0', 'supergroup'),
    (${nextChatId}, 'Online Group 4.0', 'supergroup')`;
  const [cohort] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
    VALUES ('Online Group 3.0', ${chatId}, now() - interval '50 days') RETURNING id`;
  const [next] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, previous_cohort_id)
    VALUES ('Online Group 4.0', ${nextChatId}, now() + interval '14 days', ${cohort!.id})
    RETURNING id`;
  for (const [slug, offerId] of [
    [slugs[0], "off_online_group_anna_strok_renewal_library_access"],
    [slugs[1], "off_online_group_anna_strok_renewal_discount"],
  ] as const) {
    const [campaign] = await client<{ id: string }[]>`
      INSERT INTO renewal_campaigns (slug, source_chat_id, target_chat_id,
        product_external_id, offer_external_id, title)
      VALUES (${slug}, ${chatId}, ${nextChatId}, 'prd_L9aK3mT7qP2x', ${offerId}, ${slug})
      RETURNING id`;
    await client`INSERT INTO renewal_campaign_source_chats (campaign_id, chat_id)
      VALUES (${campaign!.id}, ${chatId})`;
  }
  try {
    await run({ cohortId: cohort!.id, nextId: next!.id, chatId, nextChatId });
  } finally {
    await client`DELETE FROM purchase_side_effects WHERE deduplication_key IN (
      ${`cohort_closure_post:${cohort!.id}`}, ${`cohort_grace_reminder:${cohort!.id}`})`;
    await client`DELETE FROM renewal_campaigns WHERE slug IN ${client(slugs)}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${next!.id}`;
    await client`DELETE FROM online_group_cohorts WHERE id = ${cohort!.id}`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN (${chatId}, ${nextChatId})`;
  }
}

test("the closure window: overview, closure with a pinned post, next sales open", async (t) => {
  const calls = stubTelegram(t);
  await withCohorts(async ({ cohortId, nextId, chatId }) => {
    const overview = (await admin.getCohortsOverview()).find(
      (row) => row.id === cohortId,
    );
    assert.ok(overview);
    assert.equal(overview.next?.id, nextId);
    assert.match(overview.links?.plus ?? "", /renewal=rnw_plus_/u);
    assert.match(overview.links?.standard ?? "", /renewal=rnw_std_/u);
    assert.match(overview.draftPost, /Продлить Plus: /u);
    assert.equal(overview.post, null);

    await assert.rejects(
      admin.closeCohortFromAdmin({
        cohortId,
        confirmationTitle: "Online Group 3",
        lessonsCleared: true,
        openNextCohortSales: true,
        post: null,
      }),
      /cohort_closure_title_mismatch/u,
    );

    const result = await admin.closeCohortFromAdmin({
      cohortId,
      confirmationTitle: "Online Group 3.0",
      lessonsCleared: true,
      openNextCohortSales: true,
      post: { pin: true, text: overview.draftPost },
    });

    assert.equal(result.alreadyClosed, false);
    assert.equal(result.nextCohortSalesOpened, true);
    assert.equal(result.postStatus, "sent");
    const send = calls.find((call) => call.method === "sendMessage");
    assert.equal(send?.body.chat_id, chatId);
    assert.equal(send?.body.text, overview.draftPost);
    const pin = calls.find((call) => call.method === "pinChatMessage");
    assert.deepEqual([pin?.body.chat_id, pin?.body.message_id], [chatId, 4242]);

    const [nextRow] = await client<{ sales_enabled: boolean }[]>`
      SELECT sales_enabled FROM online_group_cohorts WHERE id = ${nextId}`;
    assert.equal(nextRow?.sales_enabled, true);
    const closed = (await admin.getCohortsOverview()).find((row) => row.id === cohortId);
    assert.equal(closed?.post?.status, "sent");
    assert.ok(closed?.closedAt);
  });
});

test("a post the bot could not send keeps the closure and can be retried", async (t) => {
  await withCohorts(async ({ cohortId }) => {
    const failing = stubTelegram(t, { failSend: true });
    const result = await admin.closeCohortFromAdmin({
      cohortId,
      confirmationTitle: "Online Group 3.0",
      lessonsCleared: true,
      openNextCohortSales: true,
      post: { pin: false, text: "Поток завершён" },
    });
    assert.notEqual(result.postStatus, "sent");
    assert.ok(failing.some((call) => call.method === "sendMessage"));
    const [cohort] = await client<{ closed_at: Date | null }[]>`
      SELECT closed_at FROM online_group_cohorts WHERE id = ${cohortId}`;
    assert.ok(cohort?.closed_at);

    t.mock.restoreAll();
    const working = stubTelegram(t);
    assert.deepEqual(await admin.retryCohortClosurePost(cohortId), { status: "sent" });
    assert.ok(working.some((call) => call.method === "sendMessage"));
  });
});

test("the grace reminder is queued on its day only, after a published post", async (t) => {
  stubTelegram(t);
  await withCohorts(async ({ cohortId }) => {
    await admin.closeCohortFromAdmin({
      cohortId,
      confirmationTitle: "Online Group 3.0",
      lessonsCleared: true,
      openNextCohortSales: true,
      post: { pin: false, text: "Поток завершён" },
    });
    const [cohort] = await client<{ access_ends_at: Date }[]>`
      SELECT access_ends_at FROM online_group_cohorts WHERE id = ${cohortId}`;
    assert.ok(cohort);
    // Access ends at the next Warsaw midnight; the Hub's last day is 6 days later and
    // the reminder comes a day before it.
    const reminderDay = new Date(
      cohort.access_ends_at.getTime() + 5 * 24 * 3600_000 + 3 * 3600_000,
    );
    const otherDay = new Date(reminderDay.getTime() - 24 * 3600_000);

    await admin.enqueueDueCohortGraceReminders(otherDay);
    const [none] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM purchase_side_effects
      WHERE deduplication_key = ${`cohort_grace_reminder:${cohortId}`}`;
    assert.equal(none?.count, 0);

    await admin.enqueueDueCohortGraceReminders(reminderDay);
    const [job] = await client<{ payload: { text: string } }[]>`
      SELECT payload FROM purchase_side_effects
      WHERE deduplication_key = ${`cohort_grace_reminder:${cohortId}`}`;
    assert.match(job?.payload.text ?? "", /^Завтра, .* последний день Inspiration Hub/u);
    assert.match(job?.payload.text ?? "", /Продлить Plus: .*rnw_plus_/u);
  });
});
