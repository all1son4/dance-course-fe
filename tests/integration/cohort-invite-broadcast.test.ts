import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import type { CohortInviteAudienceRow } from "@/db/cohort-invite-broadcast";

import { installJsonFetchFixture } from "../fixtures/providers";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * «Приглашение в поток» against PostgreSQL. Every fixture has its own chats,
 * cohorts (sales off, so no other file sees them as «on sale») and addresses,
 * and the audience is read for these cohorts only; rows are removed afterwards.
 */

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.RESEND_API_KEY = "re_cohort_invite_fixture";
process.env.ACCESS_LINK_SECRET = "cohort-invite-integration-secret-0123456789";

const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const getBroadcast = () => import("@/lib/cohort-invite-broadcast");
const getAudienceReads = () => import("@/db/cohort-invite-broadcast");

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const createFixture = async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const previousChat = `ci_prev_${run}`;
  const currentChat = `ci_cur_${run}`;

  await client`INSERT INTO telegram_chats (chat_id, title, type) VALUES
    (${previousChat}, 'Invite 2.0', 'supergroup'), (${currentChat}, 'Invite 3.0', 'supergroup')`;
  const [previous] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
    VALUES ('Online Group 2.0', ${previousChat}, '2026-08-10T06:00:00Z') RETURNING id`;
  const [current] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at, previous_cohort_id,
      duration_weeks)
    VALUES ('Online Group 3.0', ${currentChat}, '2026-11-23T17:00:00Z', ${previous!.id}, 8)
    RETURNING id`;
  const standardSlug = `ci-standard-${run}`;

  await client`
    INSERT INTO renewal_campaigns (slug, source_chat_id, target_chat_id, product_external_id,
      offer_external_id, title)
    VALUES (${standardSlug}, ${previousChat}, ${currentChat}, 'prd_L9aK3mT7qP2x',
      'off_online_group_anna_strok_renewal_discount', 'Invite renewal')`;

  const { getCohortInviteCampaignKey } = await getBroadcast();

  return {
    campaignKey: getCohortInviteCampaignKey(current!.id),
    cohort: {
      durationWeeks: 8,
      id: current!.id,
      mainChatId: currentChat,
      previousCohortId: previous!.id,
      previousMainChatId: previousChat,
      startsAt: new Date("2026-11-23T17:00:00Z"),
      title: "Online Group 3.0",
    },
    currentChat,
    email: (name: string) => `ci_${run}_${name}@example.test`,
    previousChat,
    run,
    standardSlug,
  };
};

const addPurchase = async (
  fixture: Fixture,
  {
    cohortId = null,
    email,
    locale = null,
  }: { cohortId?: string | null; email: string; locale?: string | null },
) => {
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, customer_email_snapshot, amount_minor, currency,
      stripe_status, outcome, checkout_locale, online_group_cohort_id, succeeded_at)
    VALUES (${`pi_ci_${fixture.run}_${randomUUID()}`}, ${email}, 22000, 'pln', 'succeeded',
      'succeeded', ${locale}, ${cohortId}, now())
    RETURNING id`;
  return purchase!.id;
};

const removeFixture = async (fixture: Fixture) => {
  const like = `ci_${fixture.run}_%`;
  await client`DELETE FROM purchase_side_effects WHERE recipient LIKE ${like}`;
  await client`DELETE FROM email_campaign_leads WHERE normalized_email LIKE ${like}`;
  await client`DELETE FROM access_entitlements WHERE purchase_id IN (
    SELECT id FROM purchases WHERE customer_email_snapshot LIKE ${like})`;
  await client`DELETE FROM purchases WHERE customer_email_snapshot LIKE ${like}`;
  await client`DELETE FROM renewal_campaigns WHERE slug = ${fixture.standardSlug}`;
  await client`DELETE FROM online_group_cohorts WHERE main_chat_id IN
    (${fixture.currentChat}, ${fixture.previousChat})`;
  await client`DELETE FROM telegram_chats WHERE chat_id IN
    (${fixture.currentChat}, ${fixture.previousChat})`;
};

const readAudience = async (fixture: Fixture, campaignKey = fixture.campaignKey) => {
  const { listCohortInviteAudience } = await getAudienceReads();
  const { classifyCohortInviteAudience } = await getBroadcast();
  const rows = await listCohortInviteAudience({
    campaignKey,
    cohortId: fixture.cohort.id,
    previousCohortId: fixture.cohort.previousCohortId,
  });
  const mine = rows.filter((row: CohortInviteAudienceRow) =>
    row.email.startsWith(`ci_${fixture.run}_`),
  );

  return { ...classifyCohortInviteAudience(mine), rows: mine };
};

const deliver = async (
  fixture: Fixture,
  recipients: Awaited<ReturnType<typeof readAudience>>["recipients"],
) => {
  const { deliverCohortInvite } = await getBroadcast();
  const { findCohortRenewalSlugs } = await getAudienceReads();

  return deliverCohortInvite({
    campaignKey: fixture.campaignKey,
    cohort: fixture.cohort,
    hubOnSale: true,
    pauseMs: 0,
    recipients,
    renewal: await findCohortRenewalSlugs(fixture.cohort),
  });
};

const sentEmail = (body: string) =>
  JSON.parse(body) as {
    headers?: Record<string, string>;
    html: string;
    subject: string;
    text: string;
    to: string[];
  };

test("the live audience drops a buyer between batches and a second batch sends no duplicate", async (context) => {
  const fixture = await createFixture();

  try {
    const member = fixture.email("a_member");
    const other = fixture.email("b_other");
    const plusTail = fixture.email("c_plus_tail");
    const hubBuyer = fixture.email("d_hub");
    await addPurchase(fixture, {
      cohortId: fixture.cohort.previousCohortId,
      email: member,
      locale: "pl",
    });
    await addPurchase(fixture, { email: other });
    const tailPurchase = await addPurchase(fixture, {
      cohortId: fixture.cohort.previousCohortId,
      email: plusTail,
      locale: "ru",
    });
    const hubPurchase = await addPurchase(fixture, { email: hubBuyer, locale: "en" });
    await client`INSERT INTO access_entitlements (purchase_id, access_key, status, expires_at)
      VALUES (${tailPurchase}, 'inspiration-hub', 'activated', now() + interval '5 days')`;
    await client`INSERT INTO access_entitlements (purchase_id, access_key, status, expires_at,
      source_kind)
      VALUES (${hubPurchase}, 'inspiration-hub', 'activated', now() + interval '50 days',
        'standalone_hub')`;

    const first = await readAudience(fixture);
    assert.deepEqual(
      first.recipients.map((recipient) => [recipient.email, recipient.locale]),
      [
        [member, "pl"],
        [plusTail, "ru"],
        [other, "en"],
      ],
    );
    assert.equal(first.counts.alreadyBought, 1);
    assert.equal(first.recipients[1]!.hubActive, true);

    const calls = installJsonFetchFixture(context, [
      { body: { id: "email_ci_1" } },
      { body: { id: "email_ci_2" } },
    ]);
    const batch = await deliver(fixture, first.recipients.slice(0, 2));
    assert.deepEqual(batch, {
      attempted: 2,
      failed: 0,
      sent: 2,
      skipped: 0,
      stoppedByQuota: false,
    });

    const memberEmail = sentEmail(calls[0]!.body);
    assert.deepEqual(memberEmail.to, [member]);
    assert.ok(memberEmail.text.includes(`/pl/payment?renewal=${fixture.standardSlug}`));
    // Plus has no renewal campaign in this fixture: the group page instead.
    assert.ok(memberEmail.text.includes("/pl/online/group?"));
    assert.ok(
      memberEmail.headers?.["List-Unsubscribe"]?.includes("/api/email/unsubscribe"),
    );
    assert.equal(
      memberEmail.headers?.["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
    assert.ok(
      sentEmail(calls[1]!.body).text.includes("/ru/payment?renewal=inspiration-hub"),
    );

    // The other buyer pays for the new cohort before the next batch.
    await addPurchase(fixture, { cohortId: fixture.cohort.id, email: other });
    const second = await readAudience(fixture);
    assert.deepEqual(second.recipients, []);
    assert.equal(second.counts.sent, 2);
    assert.equal(second.counts.alreadyBought, 2);

    // A stale screen sending the first batch again, twice at once, reaches nobody.
    const stale = await Promise.all([
      deliver(fixture, first.recipients.slice(0, 2)),
      deliver(fixture, first.recipients.slice(0, 2)),
    ]);
    assert.deepEqual(
      stale.map((result) => result.sent),
      [0, 0],
    );
    assert.equal(calls.length, 2);
  } finally {
    await removeFixture(fixture);
  }
});

test("two parallel batches to the same new address send one email", async (context) => {
  const fixture = await createFixture();

  try {
    await addPurchase(fixture, { email: fixture.email("parallel") });
    const { recipients } = await readAudience(fixture);
    const calls = installJsonFetchFixture(context, [
      { body: { id: "email_ci_parallel" } },
    ]);
    const results = await Promise.all([
      deliver(fixture, recipients),
      deliver(fixture, recipients),
    ]);

    assert.equal(calls.length, 1);
    assert.equal(
      results.reduce((sum, result) => sum + result.sent, 0),
      1,
    );
    assert.equal((await readAudience(fixture)).counts.sent, 1);
  } finally {
    await removeFixture(fixture);
  }
});

test("an unsubscribe click blocks the address in every campaign and GET changes nothing", async (context) => {
  const fixture = await createFixture();

  try {
    const address = fixture.email("unsubscribe");
    await addPurchase(fixture, { email: address });
    const calls = installJsonFetchFixture(context, [{ body: { id: "email_ci_unsub" } }]);
    await deliver(fixture, (await readAudience(fixture)).recipients);

    const unsubscribeUrl = sentEmail(calls[0]!.body).headers!["List-Unsubscribe"]!.slice(
      1,
      -1,
    );
    const route = await import("@/app/api/email/unsubscribe/route");

    const page = await route.GET(new Request(unsubscribeUrl));
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<form method="post"/u);
    assert.equal(
      (await readAudience(fixture, "cohort_invite:another")).counts.excluded,
      0,
    );

    for (let click = 0; click < 2; click += 1) {
      const done = await route.POST(
        new Request(unsubscribeUrl, {
          body: "List-Unsubscribe=One-Click",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          method: "POST",
        }),
      );
      assert.equal(done.status, 200);
      assert.match(await done.text(), /no longer receive/u);
    }

    const [blocked] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM email_campaign_leads
      WHERE normalized_email = ${address} AND email_send_status = 'blocked'`;
    assert.equal(blocked!.count, 1);
    // The sent row keeps its history; another campaign sees the address as excluded.
    assert.equal((await readAudience(fixture)).counts.sent, 1);
    const elsewhere = await readAudience(fixture, "cohort_invite:another");
    assert.equal(elsewhere.counts.excluded, 1);
    assert.deepEqual(elsewhere.recipients, []);

    const { createEmailCampaignLeadInDatabase } =
      await import("@/db/business-operation-jobs");
    const firstTouch = await createEmailCampaignLeadInDatabase({
      campaignKey: `first_touch_ci_${fixture.run}`,
      createdAt: new Date(),
      email: address,
      fullName: "",
      leadId: `lead_ci_${fixture.run}`,
      locale: "en",
      socialContact: "",
    });
    assert.equal(firstTouch.lead.emailSendStatus, "blocked");

    const forged = await route.POST(
      new Request(unsubscribeUrl.replace(/t=[^&]+/u, "t=lead_0000.bad"), {
        method: "POST",
      }),
    );
    assert.equal(forged.status, 404);
  } finally {
    await removeFixture(fixture);
  }
});

test("a quota refusal stops the batch and leaves its addresses in the list unmarked", async (context) => {
  const fixture = await createFixture();

  try {
    const first = fixture.email("q1");
    const second = fixture.email("q2");
    await addPurchase(fixture, { email: first });
    await addPurchase(fixture, { email: second });
    const before = await readAudience(fixture);
    const calls = installJsonFetchFixture(context, [
      {
        body: {
          message: "You have reached your daily email sending quota.",
          name: "daily_quota_exceeded",
        },
        status: 429,
      },
      { body: { id: "email_ci_after_quota" } },
    ]);

    const stopped = await deliver(fixture, before.recipients);
    assert.equal(stopped.stoppedByQuota, true);
    assert.equal(stopped.sent, 0);
    assert.equal(stopped.failed, 0);
    assert.equal(calls.length, 1);

    const after = await readAudience(fixture);
    assert.deepEqual(
      after.recipients.map((recipient) => recipient.email),
      [first, second],
    );
    assert.equal(after.counts.failed, 0);
    assert.equal(
      after.rows.find((row) => row.email === first)?.campaignStatus,
      "pending",
    );
    assert.equal(after.rows.find((row) => row.email === second)?.campaignStatus, null);

    // The cron does not retry it on its own; the next batch does.
    const [job] = await client<{ status: string }[]>`
      SELECT status FROM purchase_side_effects WHERE recipient = ${first}`;
    assert.equal(job!.status, "dead_letter");

    const resumed = await deliver(fixture, after.recipients.slice(0, 1));
    assert.equal(resumed.sent, 1);
    assert.equal(calls.length, 2);
  } finally {
    await removeFixture(fixture);
  }
});

test("a typed list skips an address this campaign already reached and sends to the rest", async (context) => {
  const fixture = await createFixture();

  try {
    const reached = fixture.email("list_reached");
    const fresh = fixture.email("list_fresh");
    await addPurchase(fixture, { email: reached, locale: "pl" });
    const calls = installJsonFetchFixture(context, [
      { body: { id: "email_ci_list_1" } },
      { body: { id: "email_ci_list_2" } },
    ]);
    await deliver(
      fixture,
      (await readAudience(fixture)).recipients.filter(
        (recipient) => recipient.email === reached,
      ),
    );

    const { checkCohortInviteAddresses } = await getBroadcast();
    const { recipients: audienceRows, rows } = await readAudience(fixture);
    assert.equal(audienceRows.length, 0);
    const list = checkCohortInviteAddresses({ addresses: [reached, fresh], rows });

    assert.deepEqual(
      list.checks.map((check) => check.status),
      ["already_sent", "ready_new"],
    );

    const result = await deliver(fixture, list.recipients);
    assert.equal(result.sent, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(sentEmail(calls[1]!.body).to, [fresh]);
    assert.ok(sentEmail(calls[1]!.body).text.includes("/en/online/group?"));

    // Checked again, both are flagged as reached, the one without a purchase too.
    const { listCampaignAddressStates } = await getAudienceReads();
    const again = checkCohortInviteAddresses({
      addresses: [reached, fresh],
      rows: (await readAudience(fixture)).rows,
      states: await listCampaignAddressStates({
        campaignKey: fixture.campaignKey,
        emails: [reached, fresh],
      }),
    });
    assert.deepEqual(
      again.checks.map((check) => check.status),
      ["already_sent", "already_sent"],
    );
    assert.deepEqual(again.recipients, []);
    const [freshRow] = await client<{ status: string }[]>`
      SELECT email_send_status AS status FROM email_campaign_leads
      WHERE normalized_email = ${fresh} AND campaign_key = ${fixture.campaignKey}`;
    assert.equal(freshRow!.status, "sent");
  } finally {
    await removeFixture(fixture);
  }
});
