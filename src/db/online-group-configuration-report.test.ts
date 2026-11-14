import assert from "node:assert/strict";
import test from "node:test";

import type { OnlineGroupCampaignSnapshot } from "./online-group-campaign-inventory";
import {
  buildOnlineGroupConfigurationReport,
  type OnlineGroupConfigurationReport,
  type OnlineGroupConfigurationReportInput,
} from "./online-group-configuration-report";
import type {
  OnlineGroupChatSnapshot,
  OnlineGroupCohortSnapshot,
  OnlineGroupConfigurationSnapshot,
} from "./online-group-configuration-snapshot";

function chat(
  chatId: string,
  overrides: Partial<OnlineGroupChatSnapshot> = {},
): OnlineGroupChatSnapshot {
  return { chatId, title: chatId, type: "supergroup", isActive: true, ...overrides };
}

function campaign(
  id: string,
  overrides: Partial<OnlineGroupCampaignSnapshot> = {},
): OnlineGroupCampaignSnapshot {
  return {
    id,
    title: "Legacy Online",
    regularChatId: "main-a",
    libraryChatId: "hub-a",
    startsAt: new Date("2026-09-01T10:00:00Z"),
    status: "active",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

function cohort(
  id: string,
  mainChatId: string,
  overrides: Partial<OnlineGroupCohortSnapshot> = {},
): OnlineGroupCohortSnapshot {
  return {
    id,
    mainChatId,
    title: "Recorded cohort",
    startsAt: new Date("2026-09-08T10:00:00Z"),
    previousCohortId: null,
    closedAt: null,
    accessEndsAt: null,
    lessonsClearedAt: null,
    salesEnabled: false,
    ...overrides,
  };
}

function input(): OnlineGroupConfigurationSnapshot {
  return {
    campaigns: [campaign("version-1")],
    chats: [chat("main-a"), chat("hub-a")],
    cohorts: [cohort("cohort-a", "main-a")],
    hubSettings: { telegramChatId: "hub-a" },
  };
}

function expectedClean(
  snapshot: OnlineGroupConfigurationReportInput,
): OnlineGroupConfigurationReport {
  return {
    groups: [
      {
        mainChatId: "main-a",
        campaigns: [snapshot.campaigns[0]],
        hubChatIds: ["hub-a"],
        mainChat: snapshot.chats.find((item) => item.chatId === "main-a") ?? null,
        cohort: snapshot.cohorts[0],
        issues: [],
      },
    ],
    chats: [...snapshot.chats].sort((left, right) =>
      left.chatId < right.chatId ? -1 : left.chatId > right.chatId ? 1 : 0,
    ),
    cohortsWithoutCampaigns: [],
    hubSettings: snapshot.hubSettings,
    hubChat: snapshot.chats.find((item) => item.chatId === "hub-a") ?? null,
    hubIssues: [],
  };
}

test("configuration report: empty input records a missing Hub setting without inventing facts", () => {
  assert.deepEqual(
    buildOnlineGroupConfigurationReport({
      campaigns: [],
      chats: [],
      cohorts: [],
      hubSettings: null,
    }),
    {
      groups: [],
      chats: [],
      cohortsWithoutCampaigns: [],
      hubSettings: null,
      hubChat: null,
      hubIssues: ["hub_settings_missing"],
    },
  );
});

test("configuration report: joins a legacy group to its registered chat and existing cohort", () => {
  const snapshot = input();
  assert.deepEqual(
    buildOnlineGroupConfigurationReport(snapshot),
    expectedClean(snapshot),
  );
});

test("configuration report: matching uses the main chat ID instead of title or start date", () => {
  const snapshot = input();
  const matching = cohort("cohort-matched", "main-a", {
    title: "Renamed and rescheduled",
    startsAt: new Date("2026-09-20T10:00:00Z"),
  });
  const decoy = cohort("cohort-decoy", "other-main", {
    title: snapshot.campaigns[0].title,
    startsAt: snapshot.campaigns[0].startsAt,
  });
  snapshot.cohorts = [decoy, matching];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.groups[0].cohort, matching);
  assert.deepEqual(report.groups[0].campaigns, snapshot.campaigns);
  assert.deepEqual(report.groups[0].issues, []);
  assert.deepEqual(report.cohortsWithoutCampaigns, [decoy]);
});

test("configuration report: a missing main chat is recorded without dropping the group or its cohort", () => {
  const snapshot = input();
  snapshot.chats = snapshot.chats.filter((item) => item.chatId !== "main-a");

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.equal(report.groups[0].mainChat, null);
  assert.deepEqual(report.groups[0].cohort, snapshot.cohorts[0]);
  assert.deepEqual(report.groups[0].campaigns, snapshot.campaigns);
  assert.deepEqual(report.groups[0].issues, ["main_chat_missing"]);
});

test("configuration report: an inactive main chat remains attached with a review note", () => {
  const snapshot = input();
  snapshot.chats = [chat("hub-a"), chat("main-a", { isActive: false })];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.groups[0].mainChat, snapshot.chats[1]);
  assert.deepEqual(report.groups[0].issues, ["main_chat_inactive"]);
});

test("configuration report: a missing cohort is not fabricated from a campaign", () => {
  const snapshot = input();
  snapshot.cohorts = [];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.equal(report.groups[0].cohort, null);
  assert.deepEqual(report.groups[0].issues, ["cohort_missing"]);
});

test("configuration report: retains all historical Hub IDs while comparing the setting only with the active version", () => {
  const snapshot = input();
  const historical = campaign("version-old", {
    libraryChatId: "old-hub",
    status: "archived",
    createdAt: new Date("2026-07-01T10:00:00Z"),
  });
  snapshot.campaigns.push(historical);

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.groups[0].campaigns, [historical, snapshot.campaigns[0]]);
  assert.deepEqual(report.groups[0].hubChatIds, ["hub-a", "old-hub"]);
  assert.deepEqual(report.groups[0].issues, ["multiple_legacy_hubs"]);
  assert.deepEqual(report.hubIssues, []);
});

test("configuration report: does not fill a missing Hub setting from an unambiguous legacy Hub", () => {
  const snapshot = input();
  snapshot.hubSettings = null;

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.equal(report.hubSettings, null);
  assert.equal(report.hubChat, null);
  assert.deepEqual(report.groups[0].hubChatIds, ["hub-a"]);
  assert.deepEqual(report.hubIssues, ["hub_settings_missing"]);
});

test("configuration report: records a missing configured Hub chat without replacing its ID", () => {
  const snapshot = input();
  snapshot.chats = [chat("main-a")];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.hubSettings, { telegramChatId: "hub-a" });
  assert.equal(report.hubChat, null);
  assert.deepEqual(report.hubIssues, ["configured_hub_chat_missing"]);
});

test("configuration report: records an inactive configured Hub chat", () => {
  const snapshot = input();
  snapshot.chats = [chat("main-a"), chat("hub-a", { isActive: false })];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.hubChat, snapshot.chats[1]);
  assert.deepEqual(report.hubIssues, ["configured_hub_chat_inactive"]);
});

test("configuration report: records Hub inactivity before a simultaneous active-campaign mismatch", () => {
  const snapshot = input();
  snapshot.chats = [chat("main-a"), chat("hub-a", { isActive: false }), chat("hub-b")];
  snapshot.campaigns = [campaign("version-new", { libraryChatId: "hub-b" })];

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.hubChat, snapshot.chats[1]);
  assert.deepEqual(report.hubIssues, [
    "configured_hub_chat_inactive",
    "configured_hub_differs_from_active_campaign",
  ]);
});

test("configuration report: reports a mismatch with the active campaign even if archived history matches", () => {
  const snapshot = input();
  snapshot.campaigns = [
    campaign("version-new", { libraryChatId: "hub-b" }),
    campaign("version-old", {
      status: "archived",
      createdAt: new Date("2026-07-01T10:00:00Z"),
    }),
  ];
  snapshot.chats.push(chat("hub-b"));

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.hubSettings, snapshot.hubSettings);
  assert.deepEqual(report.groups[0].hubChatIds, ["hub-a", "hub-b"]);
  assert.deepEqual(report.hubIssues, ["configured_hub_differs_from_active_campaign"]);
});

test("configuration report: accumulates independent notes in a fixed order", () => {
  const snapshot = input();
  snapshot.campaigns.push(
    campaign("version-old", { libraryChatId: "hub-b", status: "archived" }),
  );
  snapshot.chats = [];
  snapshot.cohorts = [];
  snapshot.hubSettings = { telegramChatId: "configured-hub" };

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.groups[0].issues, [
    "main_chat_missing",
    "cohort_missing",
    "multiple_legacy_hubs",
  ]);
  assert.deepEqual(report.hubIssues, [
    "configured_hub_chat_missing",
    "configured_hub_differs_from_active_campaign",
  ]);
});

test("configuration report: keeps cohorts without campaigns and unused registry chats", () => {
  const snapshot = input();
  const extraA = cohort("extra-a", "unused-main-a");
  const extraB = cohort("extra-b", "unused-main-b");
  const unusedChat = chat("unused-chat", { isActive: false });
  snapshot.cohorts.push(extraB, extraA);
  snapshot.chats.unshift(unusedChat);

  const report = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(report.cohortsWithoutCampaigns, [extraA, extraB]);
  assert.deepEqual(
    report.chats.find((item) => item.chatId === unusedChat.chatId),
    unusedChat,
  );

  snapshot.campaigns = [];
  assert.deepEqual(
    buildOnlineGroupConfigurationReport(snapshot).cohortsWithoutCampaigns,
    [snapshot.cohorts[0], extraA, extraB],
  );
});

test("configuration report: input order does not change the report", () => {
  const snapshot = input();
  snapshot.campaigns.push(
    campaign("version-z", { regularChatId: "main-z", status: "archived" }),
  );
  snapshot.chats.push(chat("main-z"));
  snapshot.cohorts.push(cohort("cohort-z", "main-z"), cohort("orphan", "unused-main"));
  const expected = buildOnlineGroupConfigurationReport(snapshot);

  assert.deepEqual(
    buildOnlineGroupConfigurationReport({
      campaigns: [...snapshot.campaigns].reverse(),
      chats: [...snapshot.chats].reverse(),
      cohorts: [...snapshot.cohorts].reverse(),
      hubSettings: snapshot.hubSettings,
    }),
    expected,
  );
  assert.deepEqual(
    expected.groups.map((group) => group.mainChatId),
    ["main-a", "main-z"],
  );
  assert.deepEqual(
    expected.chats.map((item) => item.chatId),
    ["hub-a", "main-a", "main-z"],
  );
});

test("configuration report: repeated calls preserve frozen inputs and own their result arrays", () => {
  const snapshot = input();
  snapshot.cohorts.push(cohort("orphan", "unused-main"));
  for (const rows of [snapshot.campaigns, snapshot.chats, snapshot.cohorts]) {
    for (const row of rows) Object.freeze(row);
    Object.freeze(rows);
  }
  Object.freeze(snapshot.hubSettings);
  Object.freeze(snapshot);
  const before = JSON.stringify(snapshot);

  const first = buildOnlineGroupConfigurationReport(snapshot);
  const second = buildOnlineGroupConfigurationReport(snapshot);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(snapshot), before);
  assert.notStrictEqual(first.chats, snapshot.chats);
  assert.notStrictEqual(first.groups[0].campaigns, snapshot.campaigns);
  first.groups[0].campaigns.pop();
  first.groups[0].hubChatIds.push("local-only-hub");
  first.groups[0].issues.push("cohort_missing");
  first.chats.pop();
  first.cohortsWithoutCampaigns.pop();
  first.hubIssues.push("hub_settings_missing");
  assert.deepEqual(second, buildOnlineGroupConfigurationReport(snapshot));
  assert.equal(JSON.stringify(snapshot), before);
});
