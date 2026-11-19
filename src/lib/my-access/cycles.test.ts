import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCompletedCohortIds,
  collectMemberCohortIds,
  countLegendCycles,
  type CycleFacts,
} from "./cycles";

const STANDARD = "off_R6vN2cH9sW4y";
const PLUS = "off_online_group_anna_strok_library_access";
const RENEWAL_PLUS = "off_online_group_anna_strok_renewal_library_access";

const cohorts: CycleFacts["cohorts"] = [
  { closed: true, id: "c1", mainChatId: "chat-1" },
  { closed: true, id: "c2", mainChatId: "chat-2" },
  { closed: false, id: "c3", mainChatId: "chat-3" },
];
// Renewals into 2.0 from the 1.0 chat; into 3.0 from the 2.0 chat.
const renewalCampaigns: CycleFacts["renewalCampaigns"] = [
  { offerExternalId: RENEWAL_PLUS, sourceChatIds: ["chat-1"], targetChatId: "chat-2" },
  { offerExternalId: RENEWAL_PLUS, sourceChatIds: ["chat-2"], targetChatId: "chat-3" },
];
const facts = (patch: Partial<CycleFacts>): CycleFacts => ({
  cohorts,
  purchases: [],
  renewalCampaigns,
  verifiedChatIds: [],
  ...patch,
});

test("a cycle bought counts once it is closed, once however often it was bought", () => {
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({
        purchases: [
          { cohortId: "c1", offerExternalId: STANDARD },
          { cohortId: "c1", offerExternalId: STANDARD },
          { cohortId: "c2", offerExternalId: PLUS },
          // Still running: not behind yet.
          { cohortId: "c3", offerExternalId: PLUS },
        ],
      }),
    ),
    ["c1", "c2"],
  );
});

test("a renewal into a cycle proves the cycle of its campaign's source chat", () => {
  // Renewed into 2.0, no 1.0 purchase on record: the renewal proves 1.0.
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({ purchases: [{ cohortId: "c2", offerExternalId: RENEWAL_PLUS }] }),
    ),
    ["c1", "c2"],
  );
  // Renewed into 3.0 (not closed): it proves 2.0, and 3.0 is not behind yet.
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({ purchases: [{ cohortId: "c3", offerExternalId: RENEWAL_PLUS }] }),
    ),
    ["c2"],
  );
  // Full price, not a renewal: proves nothing about the cycle before.
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({ purchases: [{ cohortId: "c2", offerExternalId: PLUS }] }),
    ),
    ["c2"],
  );
});

test("a renewal open to several earlier cycles proves none of them in particular", () => {
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({
        purchases: [{ cohortId: "c3", offerExternalId: RENEWAL_PLUS }],
        renewalCampaigns: [
          {
            offerExternalId: RENEWAL_PLUS,
            sourceChatIds: ["chat-1", "chat-2"],
            targetChatId: "chat-3",
          },
        ],
      }),
    ),
    [],
  );
  // A campaign for another offer, or into another chat, is not this renewal's.
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({
        purchases: [{ cohortId: "c2", offerExternalId: RENEWAL_PLUS }],
        renewalCampaigns: [
          {
            offerExternalId: "off_online_group_anna_strok_renewal_discount",
            sourceChatIds: ["chat-1"],
            targetChatId: "chat-2",
          },
          {
            offerExternalId: RENEWAL_PLUS,
            sourceChatIds: ["chat-1"],
            targetChatId: "chat-9",
          },
        ],
      }),
    ),
    ["c2"],
  );
});

test("membership the site verified in a cycle's chat counts that cycle", () => {
  assert.deepEqual(
    collectCompletedCohortIds(
      facts({ verifiedChatIds: ["chat-1", "chat-3", "unknown-chat"] }),
    ),
    ["c1"],
  );
});

test("no facts, no cycles", () => {
  assert.deepEqual(collectCompletedCohortIds(facts({})), []);
});

test("the cycles a customer is in include the running one, once bought", () => {
  assert.deepEqual(
    collectMemberCohortIds(
      facts({
        purchases: [
          { cohortId: "c1", offerExternalId: STANDARD },
          { cohortId: "c3", offerExternalId: RENEWAL_PLUS },
          { cohortId: "unknown", offerExternalId: PLUS },
        ],
      }),
    ),
    // 3.0 bought; its renewal proves 2.0; an unknown cohort is no cycle.
    ["c1", "c2", "c3"],
  );
});

test("«Легенда группы»: every cycle from the first, the newest one paid", () => {
  const all = ["c1", "c2", "c3"];
  assert.equal(countLegendCycles(all, ["c1", "c2", "c3"]), 3);
  // The newest not bought yet, even before its start: no medal.
  assert.equal(countLegendCycles(all, ["c1", "c2"]), null);
  // One cycle missed in between, or the first one: no medal.
  assert.equal(countLegendCycles(all, ["c1", "c3"]), null);
  assert.equal(countLegendCycles(all, ["c2", "c3"]), null);
  // A single cycle is not a streak.
  assert.equal(countLegendCycles(["c1"], ["c1"]), null);
  assert.equal(countLegendCycles([], []), null);
});
