import assert from "node:assert/strict";
import test from "node:test";

import type { EmailCampaignLeadRecord } from "./email-campaign-record";

const EMAIL_CAMPAIGN_FIELDS = [
  "lead_id",
  "campaign_key",
  "email_send_status",
  "full_name",
  "social_contact",
  "email",
  "locale",
  "created_at",
  "email_sent_at",
  "email_send_attempts",
  "last_email_error",
] as const satisfies readonly (keyof EmailCampaignLeadRecord)[];

test("campaign contract preserves all eleven archive fields and empty delivery evidence", () => {
  const record: EmailCampaignLeadRecord = {
    lead_id: "lead_contract_fixture",
    campaign_key: "campaign_fixture",
    email_send_status: "pending",
    full_name: "Тестовая участница",
    social_contact: "@fixture",
    email: "fixture@example.test",
    locale: "ru",
    created_at: "2026-09-08T05:00:00.000Z",
    email_sent_at: "",
    email_send_attempts: "0",
    last_email_error: "",
  };
  const restored: EmailCampaignLeadRecord = { ...record };
  assert.deepEqual(Object.keys(record), [...EMAIL_CAMPAIGN_FIELDS]);
  assert.deepEqual(restored, record);
  assert.equal(restored.email_send_attempts, "0");
  assert.equal(restored.email_sent_at, "");
});
