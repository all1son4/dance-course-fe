import assert from "node:assert/strict";
import test from "node:test";

import type { AdminInviteLinkHistoryRecord } from "./admin-invite-link-history-record";
import type { AdminInviteLinkHistorySourceRecord } from "./google-sheets-schema";

// Only archive-boundary tests import both contracts. Runtime owns its own type.
test("history contract preserves all nine archive fields and missing timestamps", () => {
  const record: AdminInviteLinkHistoryRecord = {
    accessUrl: "https://t.me/+private_invite",
    adminLabel: "",
    createdAt: "2026-08-13T10:00:00.000Z",
    lessonLanguage: "en",
    offerLabel: "Standard",
    productTitle: "Course",
    purchaseItem: "Course — Standard",
    tokenExpiresAt: "2026-08-14T10:00:00.000Z",
    tokenUsedAt: "",
  };
  // No casts: TypeScript checks assignability at both archive boundaries.
  const archive: AdminInviteLinkHistorySourceRecord = record;
  const restored: AdminInviteLinkHistoryRecord = { ...archive };

  assert.deepEqual(Object.keys(record), [
    "accessUrl",
    "adminLabel",
    "createdAt",
    "lessonLanguage",
    "offerLabel",
    "productTitle",
    "purchaseItem",
    "tokenExpiresAt",
    "tokenUsedAt",
  ]);
  assert.deepEqual(restored, record);
  // An unused link keeps an empty tokenUsedAt, which is how the route reads "active".
  assert.equal(restored.tokenUsedAt, "");
  assert.equal(restored.adminLabel, "");
});
