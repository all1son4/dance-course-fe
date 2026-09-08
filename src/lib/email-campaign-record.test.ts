import assert from "node:assert/strict";
import test from "node:test";

import type { EmailCampaignLeadRecord } from "./email-campaign-record";
import {
  EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS,
  type EmailCampaignLeadSheetRecord,
} from "./google-sheets-schema";

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
  // No casts: both archive boundaries are checked by TypeScript.
  const archive: EmailCampaignLeadSheetRecord = record;
  const restored: EmailCampaignLeadRecord = { ...archive };
  assert.deepEqual(Object.keys(record), [...EMAIL_CAMPAIGN_LEADS_SHEET_HEADERS]);
  assert.deepEqual(restored, record);
  assert.equal(restored.email_send_attempts, "0");
  assert.equal(restored.email_sent_at, "");
});
