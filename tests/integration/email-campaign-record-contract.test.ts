import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { claimEmailCampaignLeadForDelivery } from "@/db/business-operation-jobs";
import { getDatabaseClient } from "@/db/client";
import {
  findEmailCampaignLeadRecord,
  listEmailCampaignLeadReadRecords,
} from "@/lib/business-operation-read-runtime";
import type { EmailCampaignLeadRecord } from "@/lib/email-campaign-record";
import {
  createEmailCampaignLead,
  excludeEmailCampaignLead,
  getEmailCampaignAdminSnapshot,
} from "@/lib/email-campaigns";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

const blockProviders = (context: TestContext) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("Campaign record checks must not contact providers");
  });
  context.after(() => assert.equal(fetchMock.mock.callCount(), 0));
};
after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createLead = (campaignKey: string, email: string) =>
  createEmailCampaignLead({
    campaignKey,
    email,
    fullName: "",
    locale: "",
    socialContact: "",
  });

test("campaign signup returns the same eleven-field record for concurrent and later duplicates", async (context) => {
  blockProviders(context);
  const campaignKey = `campaign_contract_create_${randomUUID()}`;
  const email = `fixture-${randomUUID()}@example.test`;
  const input = {
    campaignKey: ` ${campaignKey} `,
    email: ` ${email.toUpperCase()} `,
    fullName: "  Тестовая участница  ",
    socialContact: "  @fixture  ",
    locale: " ru ",
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => createEmailCampaignLead(input)),
    );
    assert.equal(results.filter((result) => !result.duplicate).length, 1);
    const expected: EmailCampaignLeadRecord = {
      lead_id: `lead_${createHash("sha256").update(`${campaignKey}:${email}`).digest("hex").slice(0, 24)}`,
      campaign_key: campaignKey,
      email_send_status: "pending",
      full_name: "Тестовая участница",
      social_contact: "@fixture",
      email,
      locale: "ru",
      created_at: results[0].lead.created_at,
      email_sent_at: "",
      email_send_attempts: "0",
      last_email_error: "",
    };
    assert.equal(new Date(expected.created_at).toISOString(), expected.created_at);
    for (const result of results) assert.deepEqual(result.lead, expected);
    assert.deepEqual(await findEmailCampaignLeadRecord(input), expected);
    assert.deepEqual(
      await createEmailCampaignLead({ ...input, fullName: "Changed", locale: "pl" }),
      {
        duplicate: true,
        lead: expected,
      },
    );
    assert.equal(
      await findEmailCampaignLeadRecord({ campaignKey, email: "missing@example.test" }),
      null,
    );
    assert.equal(await findEmailCampaignLeadRecord({ campaignKey: " ", email }), null);
    assert.deepEqual(
      (await listEmailCampaignLeadReadRecords()).filter(
        (lead) => lead.campaign_key === campaignKey,
      ),
      [expected],
    );
  } finally {
    await client`DELETE FROM email_campaign_leads WHERE campaign_key = ${campaignKey}`;
  }
});

test("campaign database projections preserve every status and the existing audience classification", async (context) => {
  blockProviders(context);
  const campaignKey = `campaign_contract_states_${randomUUID()}`;
  const email = `fixture-${randomUUID()}@example.test`;
  try {
    const { lead } = await createLead(campaignKey, email);
    for (const status of [
      "pending",
      "sending",
      "failed",
      "sent",
      "excluded",
      "blocked",
    ] as const) {
      const expected: EmailCampaignLeadRecord = {
        ...lead,
        email_send_status: status,
        email_send_attempts: status === "pending" ? "0" : "3",
        email_sent_at: status === "sent" ? "2026-09-08T05:00:00.000Z" : "",
        last_email_error: status === "failed" ? "fixture delivery error" : "",
      };
      await client`
        UPDATE email_campaign_leads SET
          email_send_status = ${status}, email_send_attempts = ${Number(expected.email_send_attempts)},
          email_sent_at = ${expected.email_sent_at || null}, last_email_error = ${expected.last_email_error}
        WHERE lead_id = ${lead.lead_id}
      `;
      assert.deepEqual(
        await findEmailCampaignLeadRecord({ campaignKey, email }),
        expected,
      );
      assert.deepEqual(
        (await listEmailCampaignLeadReadRecords()).filter(
          (row) => row.campaign_key === campaignKey,
        ),
        [expected],
      );
      const snapshot = await getEmailCampaignAdminSnapshot(` ${campaignKey} `);
      assert.deepEqual(snapshot.stats, {
        total: 1,
        excluded: status === "excluded" || status === "blocked" ? 1 : 0,
        failed: status === "failed" ? 1 : 0,
        pending: status === "pending" || status === "sending" ? 1 : 0,
        sent: status === "sent" ? 1 : 0,
      });
      assert.deepEqual(
        snapshot.audience,
        status === "pending" || status === "failed"
          ? [
              {
                createdAt: lead.created_at,
                email,
                fullName: "",
                leadId: lead.lead_id,
                locale: "",
                socialContact: "",
                status,
              },
            ]
          : [],
      );
    }
  } finally {
    await client`DELETE FROM email_campaign_leads WHERE campaign_key = ${campaignKey}`;
  }
});

test("campaign-only exclusions stay local while global blocks cover existing and future campaigns", async (context) => {
  blockProviders(context);
  const runId = randomUUID();
  const campaignA = `campaign_contract_scope_a_${runId}`;
  const campaignB = `campaign_contract_scope_b_${runId}`;
  const campaignC = `campaign_contract_scope_c_${runId}`;
  const localEmail = `local-${runId}@example.test`;
  const globalEmail = `global-${runId}@example.test`;
  try {
    const localA = await createLead(campaignA, localEmail);
    const localB = await createLead(campaignB, localEmail);
    const globalA = await createLead(campaignA, globalEmail);
    const globalB = await createLead(campaignB, globalEmail);
    const localExclusion = await excludeEmailCampaignLead({
      campaignKey: campaignA,
      leadId: localA.lead.lead_id,
      scope: "campaign",
    });
    assert.equal(localExclusion.status, "excluded");
    if (localExclusion.status === "excluded")
      assert.equal(localExclusion.scope, "campaign");
    assert.deepEqual(
      await findEmailCampaignLeadRecord({ campaignKey: campaignB, email: localEmail }),
      localB.lead,
    );

    const globalExclusion = await excludeEmailCampaignLead({
      campaignKey: campaignA,
      leadId: globalA.lead.lead_id,
      scope: "global",
    });
    assert.equal(globalExclusion.status, "excluded");
    if (globalExclusion.status === "excluded") {
      assert.equal(globalExclusion.scope, "global");
      assert.deepEqual(globalExclusion.snapshot, {
        audience: [],
        stats: { total: 2, excluded: 2, failed: 0, pending: 0, sent: 0 },
      });
    }
    assert.deepEqual(
      await findEmailCampaignLeadRecord({ campaignKey: campaignA, email: localEmail }),
      { ...localA.lead, email_send_status: "excluded" },
    );
    assert.deepEqual(
      await findEmailCampaignLeadRecord({ campaignKey: campaignA, email: globalEmail }),
      { ...globalA.lead, email_send_status: "blocked" },
    );
    // Global exclusion suppresses delivery without rewriting other campaign records.
    assert.deepEqual(
      await findEmailCampaignLeadRecord({ campaignKey: campaignB, email: globalEmail }),
      globalB.lead,
    );
    assert.equal(
      (
        await claimEmailCampaignLeadForDelivery({
          campaignKey: campaignB,
          leadId: globalB.lead.lead_id,
        })
      ).status,
      "excluded",
    );
    const snapshotB = await getEmailCampaignAdminSnapshot(campaignB);
    assert.deepEqual(snapshotB.stats, {
      total: 2,
      excluded: 1,
      failed: 0,
      pending: 1,
      sent: 0,
    });
    assert.deepEqual(
      snapshotB.audience.map((lead) => lead.leadId),
      [localB.lead.lead_id],
    );
    const future = await createLead(campaignC, ` ${globalEmail.toUpperCase()} `);
    assert.equal(future.lead.email_send_status, "blocked");
    assert.deepEqual(await getEmailCampaignAdminSnapshot(campaignC), {
      audience: [],
      stats: { total: 1, excluded: 1, failed: 0, pending: 0, sent: 0 },
    });
    assert.deepEqual(
      await excludeEmailCampaignLead({
        campaignKey: campaignA,
        leadId: localA.lead.lead_id,
        scope: "campaign",
      }),
      { status: "not_actionable" },
    );
    assert.deepEqual(
      await excludeEmailCampaignLead({
        campaignKey: campaignA,
        leadId: "missing-fixture",
        scope: "global",
      }),
      { status: "not_found" },
    );
  } finally {
    await client`DELETE FROM email_campaign_leads WHERE campaign_key IN (${campaignA}, ${campaignB}, ${campaignC})`;
  }
});
